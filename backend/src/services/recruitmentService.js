import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  RECRUITMENT_CONFIG,
  createRecruitmentQuestionSet,
  getRecruitmentQuestion
} from "../config/recruitmentConfig.js";

const ROOT_PATH = "voxel/v1/recruitment";

function now() {
  return Date.now();
}

function createToken() {
  return randomBytes(24).toString("base64url");
}

function tokenKey(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeAnswers(rawAnswers) {
  if (!Array.isArray(rawAnswers)) return new Map();

  const result = new Map();
  for (const raw of rawAnswers) {
    const questionId = typeof raw?.questionId === "string" ? raw.questionId.trim() : "";
    const optionId = typeof raw?.optionId === "string" ? raw.optionId.trim() : "";
    if (!questionId || !optionId || result.has(questionId)) continue;
    result.set(questionId, optionId);
  }
  return result;
}

export class RecruitmentService {
  constructor({ database, codeStore, gameBridgeService, gameBanService }) {
    this.root = database.ref(ROOT_PATH);
    this.candidatesRef = this.root.child("candidates");
    this.sessionsRef = this.root.child("sessions");
    this.attemptsRef = this.root.child("attempts");
    this.passedRef = this.root.child("passed");
    this.pendingRef = this.root.child("pending");
    this.pendingClaimsRef = this.root.child("pendingClaims");
    this.codeStore = codeStore;
    this.gameBridgeService = gameBridgeService;
    this.gameBanService = gameBanService;
  }

  async start(code) {
    const normalizedCode = String(code ?? "").trim();
    if (!normalizedCode) throw createError("Informe o código temporário gerado dentro do jogo.", 400);

    const claim = await this.codeStore.claim(normalizedCode);
    if (!claim) {
      throw createError("Código inválido, expirado ou já utilizado. Gere um novo código dentro do jogo.", 400);
    }

    let candidateKey = null;
    let sessionId = null;

    try {
      const profile = claim.profile;
      const robloxUserId = Number(profile?.userId ?? 0);
      if (!Number.isSafeInteger(robloxUserId) || robloxUserId <= 0) {
        throw createError("O código não possui uma conta Roblox válida.", 400);
      }

      if (profile?.military?.isMember === true) {
        throw createError("Esta conta já pertence ao Exército Brasileiro.", 409);
      }

      if (this.gameBanService) {
        const status = await this.gameBanService.getStatus(robloxUserId);
        if (status.banned) {
          throw createError("Esta conta possui um bloqueio ativo no jogo e não pode realizar o alistamento.", 403);
        }
      }

      const passed = await this.passedRef.child(String(robloxUserId)).get();
      if (passed.exists()) {
        throw createError("O alistamento desta conta já foi concluído anteriormente.", 409);
      }

      const pending = await this.pendingRef.child(String(robloxUserId)).get();
      if (pending.exists()) {
        throw createError("Esta conta já foi aprovada. Entre no jogo para concluir o ingresso automaticamente.", 409);
      }

      const candidateToken = createToken();
      candidateKey = tokenKey(candidateToken);
      const timestamp = now();
      const candidate = {
        robloxUserId,
        username: String(profile?.username ?? ""),
        characterName: String(profile?.characterName ?? ""),
        createdAt: timestamp,
        expiresAt: timestamp + RECRUITMENT_CONFIG.candidateTtlMs,
        failedAttempts: 0,
        cooldownUntil: 0,
        examPassed: false,
        score: null,
        enrolled: false,
        enrolledAt: null
      };

      await this.candidatesRef.child(candidateKey).set(candidate);
      const session = await this.#createSession(candidateKey, candidate);
      sessionId = session.sessionId;

      const committed = await this.codeStore.commit(claim);
      if (!committed) {
        throw createError("Não foi possível confirmar o código de alistamento. Gere outro código e tente novamente.", 503);
      }

      console.info(`[recruitment] Session started for Roblox ${robloxUserId}.`);
      return {
        candidateToken,
        candidate: {
          robloxUserId,
          username: candidate.username,
          characterName: candidate.characterName
        },
        ...session
      };
    } catch (error) {
      if (sessionId) await this.sessionsRef.child(sessionId).remove().catch(() => {});
      if (candidateKey) await this.candidatesRef.child(candidateKey).remove().catch(() => {});
      await this.codeStore.release(claim).catch(() => {});
      throw error;
    }
  }

  async retry(candidateToken) {
    const { key, candidate } = await this.#getCandidate(candidateToken);
    const timestamp = now();

    if (candidate.enrolled === true) {
      throw createError("Este alistamento já foi concluído.", 409);
    }
    if (candidate.examPassed === true) {
      throw createError("A prova já foi aprovada. Conclua apenas a entrada na comunidade.", 409);
    }

    const cooldownUntil = Number(candidate.cooldownUntil ?? 0);
    if (cooldownUntil > timestamp) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownUntil - timestamp) / 1000));
      const error = createError(`Aguarde ${retryAfterSeconds}s antes de iniciar outra tentativa.`, 429);
      error.retryAfterSeconds = retryAfterSeconds;
      throw error;
    }

    return this.#createSession(key, candidate);
  }

  async submit({ candidateToken, sessionId, answers }) {
    const { key, candidate } = await this.#getCandidate(candidateToken);
    if (candidate.enrolled === true) throw createError("Este alistamento já foi concluído.", 409);
    if (candidate.examPassed === true) {
      return this.complete(candidateToken);
    }

    const safeSessionId = String(sessionId ?? "").trim();
    if (!safeSessionId) {
      throw createError("Sessão da prova inválida. Inicie uma nova tentativa.", 409);
    }

    const sessionRef = this.sessionsRef.child(safeSessionId);
    const timestamp = now();
    const sessionSnapshot = await sessionRef.get();
    const session = sessionSnapshot.val();

    if (!session || typeof session !== "object") {
      throw createError("Esta prova não existe mais. Inicie uma nova tentativa.", 409);
    }

    if (String(session.candidateKey ?? "") !== key) {
      console.warn(`[recruitment] Submission rejected for session ${safeSessionId}: candidate mismatch.`);
      throw createError("Esta prova não pertence à sua sessão de alistamento.", 409);
    }

    if (Number(session.expiresAt ?? 0) <= timestamp) {
      console.info(`[recruitment] Submission rejected for expired session ${safeSessionId}.`);
      throw createError("Esta prova expirou. Inicie uma nova tentativa.", 409);
    }

    if (session.submittedAt) {
      console.info(`[recruitment] Submission rejected for completed session ${safeSessionId}.`);
      throw createError("Esta prova já foi enviada. Inicie uma nova tentativa.", 409);
    }

    // Lock only the empty marker. RTDB can claim this atomically even with a cold local cache.
    const submittedAtRef = sessionRef.child("submittedAt");
    const lock = await submittedAtRef.transaction((current) => {
      if (current !== null && current !== undefined) return;
      return timestamp;
    });

    if (!lock.committed) {
      const currentSubmittedAt = lock.snapshot.val();
      console.warn(
        `[recruitment] Submission lock denied for session ${safeSessionId}: submittedAt=${currentSubmittedAt ?? "none"}.`
      );
      throw createError("Esta prova já está sendo processada ou já foi enviada.", 409);
    }

    console.info(
      `[recruitment] Submission locked for session ${safeSessionId} (Roblox ${candidate.robloxUserId}).`
    );

    const questionIds = Array.isArray(session.questionIds) ? session.questionIds : [];
    if (questionIds.length !== RECRUITMENT_CONFIG.questionCount) {
      throw createError("A prova não pôde ser validada. Inicie uma nova tentativa.", 409);
    }

    const answerMap = sanitizeAnswers(answers);
    let correctCount = 0;
    for (const questionId of questionIds) {
      const question = getRecruitmentQuestion(questionId);
      if (question && answerMap.get(questionId) === question.correctOptionId) correctCount += 1;
    }

    const score = Math.round((correctCount / RECRUITMENT_CONFIG.questionCount) * 100);
    const passed = score >= RECRUITMENT_CONFIG.passingScore;
    const attempt = {
      sessionId: safeSessionId,
      robloxUserId: candidate.robloxUserId,
      score,
      correctCount,
      totalQuestions: RECRUITMENT_CONFIG.questionCount,
      passed,
      submittedAt: timestamp
    };
    await this.attemptsRef.child(String(candidate.robloxUserId)).push(attempt);

    if (!passed) {
      await this.candidatesRef.child(key).update({
        failedAttempts: Number(candidate.failedAttempts ?? 0) + 1,
        cooldownUntil: timestamp + RECRUITMENT_CONFIG.retryCooldownMs,
        score
      });
      await sessionRef.update({ outcome: "failed", score });

      console.info(`[recruitment] Roblox ${candidate.robloxUserId} failed with ${score}%.`);
      return {
        passed: false,
        enrolled: false,
        score,
        correctCount,
        totalQuestions: RECRUITMENT_CONFIG.questionCount,
        passingScore: RECRUITMENT_CONFIG.passingScore,
        retryAfterSeconds: Math.ceil(RECRUITMENT_CONFIG.retryCooldownMs / 1000)
      };
    }

    await this.candidatesRef.child(key).update({
      examPassed: true,
      score,
      cooldownUntil: 0
    });
    await sessionRef.update({ outcome: "passed", score });

    const approvedCandidate = { ...candidate, examPassed: true, score };
    await this.pendingRef.child(String(candidate.robloxUserId)).set({
      candidateKey: key,
      robloxUserId: Number(candidate.robloxUserId),
      username: String(candidate.username ?? ""),
      characterName: String(candidate.characterName ?? ""),
      score,
      approvedAt: timestamp
    });

    console.info(`[recruitment] Roblox ${candidate.robloxUserId} passed with ${score}% and is pending automatic enrollment.`);
    const enrollment = await this.#completeEnrollment(key, approvedCandidate);
    return {
      passed: true,
      score,
      correctCount,
      totalQuestions: RECRUITMENT_CONFIG.questionCount,
      passingScore: RECRUITMENT_CONFIG.passingScore,
      ...enrollment
    };
  }

  async complete(candidateToken) {
    const { key, candidate } = await this.#getCandidate(candidateToken);
    if (candidate.enrolled === true) {
      return {
        enrolled: true,
        roleName: String(candidate.roleName ?? "Recruta"),
        roleRank: Number(candidate.roleRank ?? 1),
        communityName: RECRUITMENT_CONFIG.mainCommunityName,
        alreadyCompleted: true
      };
    }
    if (candidate.examPassed !== true) {
      throw createError("A prova precisa ser aprovada antes da entrada na comunidade.", 409);
    }
    return this.#completeEnrollment(key, candidate);
  }

  async claimPendingForOnline(serverId, onlineUserIds = []) {
    const normalizedServerId = String(serverId ?? "").trim();
    if (!normalizedServerId) return null;

    const online = [...new Set((onlineUserIds ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0))];
    if (online.length === 0) return null;

    const pendingSnapshot = await this.pendingRef.get();
    const pendingByUser = pendingSnapshot.val();
    if (!pendingByUser || typeof pendingByUser !== "object") return null;

    const timestamp = now();
    const claimTtlMs = 30_000;

    for (const robloxUserId of online) {
      const userKey = String(robloxUserId);
      const pending = pendingByUser[userKey];
      if (!pending || typeof pending !== "object") continue;

      const claimId = randomUUID();
      const claimRef = this.pendingClaimsRef.child(userKey);
      const transaction = await claimRef.transaction((current) => {
        const currentExpiresAt = Number(current?.expiresAt ?? 0);
        if (current && currentExpiresAt > timestamp) return;

        return {
          claimId,
          serverId: normalizedServerId,
          claimedAt: timestamp,
          expiresAt: timestamp + claimTtlMs
        };
      });

      if (!transaction.committed) continue;

      console.info(`[recruitment] Pending enrollment claimed for Roblox ${robloxUserId} by ${normalizedServerId}.`);
      return {
        id: `recruitment:${robloxUserId}:${claimId}`,
        type: "recruit-main",
        payload: {
          targetRobloxUserId: robloxUserId,
          source: "website-recruitment-auto"
        }
      };
    }

    return null;
  }

  async completeBridgeAction({ serverId, actionId, success, data = null, error = null }) {
    const match = /^recruitment:(\d+):([0-9a-f-]{36})$/i.exec(String(actionId ?? ""));
    if (!match) return false;

    const robloxUserId = Number(match[1]);
    const claimId = match[2];
    const userKey = String(robloxUserId);
    const claimRef = this.pendingClaimsRef.child(userKey);
    const claimSnapshot = await claimRef.get();
    const claim = claimSnapshot.val();

    if (!claim || claim.claimId !== claimId || claim.serverId !== String(serverId ?? "")) {
      console.warn(`[recruitment] Ignored stale enrollment result for Roblox ${robloxUserId}.`);
      return true;
    }

    if (success) {
      const pendingSnapshot = await this.pendingRef.child(userKey).get();
      const pending = pendingSnapshot.val();
      if (pending && typeof pending === "object") {
        await this.#finalizeEnrollment(String(pending.candidateKey ?? ""), pending, data);
      } else {
        await claimRef.remove().catch(() => {});
      }
      return true;
    }

    await claimRef.remove().catch(() => {});
    console.warn(
      `[recruitment] Automatic enrollment failed for Roblox ${robloxUserId}: ${String(error ?? "unknown error")}`
    );
    return true;
  }

  async #createSession(candidateKey, candidate) {
    const questions = createRecruitmentQuestionSet();
    const timestamp = now();
    const sessionId = randomUUID();

    await this.sessionsRef.child(sessionId).set({
      candidateKey,
      robloxUserId: candidate.robloxUserId,
      questionIds: questions.map((question) => question.id),
      createdAt: timestamp,
      expiresAt: timestamp + RECRUITMENT_CONFIG.sessionTtlMs,
      submittedAt: null,
      outcome: null,
      score: null
    });

    return {
      sessionId,
      expiresAt: timestamp + RECRUITMENT_CONFIG.sessionTtlMs,
      passingScore: RECRUITMENT_CONFIG.passingScore,
      questions
    };
  }

  async #getCandidate(candidateToken) {
    const token = String(candidateToken ?? "").trim();
    if (!token) throw createError("Sessão de alistamento inválida.", 401);

    const key = tokenKey(token);
    const snapshot = await this.candidatesRef.child(key).get();
    const candidate = snapshot.val();
    if (!candidate || Number(candidate.expiresAt ?? 0) <= now()) {
      if (candidate) await this.candidatesRef.child(key).remove().catch(() => {});
      throw createError("Sua sessão de alistamento expirou. Gere um novo código dentro do jogo.", 401);
    }

    return { key, candidate };
  }

  async #completeEnrollment(candidateKey, candidate) {
    try {
      const data = await this.gameBridgeService.request("recruit-main", {
        targetRobloxUserId: Number(candidate.robloxUserId),
        source: "website-recruitment"
      });

      return this.#finalizeEnrollment(candidateKey, candidate, data);
    } catch (error) {
      console.warn(`[recruitment] Enrollment pending for Roblox ${candidate.robloxUserId}:`, error?.message ?? error);
      return {
        enrolled: false,
        enrollmentPending: true,
        message: "Sua prova foi aprovada. Ao entrar no jogo, o Voxel concluirá seu ingresso como Recruta automaticamente."
      };
    }
  }

  async #finalizeEnrollment(candidateKey, candidate, data) {
    const timestamp = now();
    const robloxUserId = Number(candidate.robloxUserId);
    const result = {
      enrolled: true,
      enrolledAt: timestamp,
      communityId: String(data?.communityId ?? ""),
      communityName: String(data?.communityName ?? RECRUITMENT_CONFIG.mainCommunityName),
      roleId: String(data?.roleId ?? ""),
      roleName: String(data?.roleName ?? "Recruta"),
      roleRank: Number(data?.roleRank ?? 1)
    };

    if (candidateKey) {
      await this.candidatesRef.child(candidateKey).update(result).catch(() => {});
    }

    await this.passedRef.child(String(robloxUserId)).set({
      robloxUserId,
      username: String(candidate.username ?? ""),
      characterName: String(candidate.characterName ?? ""),
      score: Number(candidate.score ?? 100),
      communityId: result.communityId,
      communityName: result.communityName,
      roleId: result.roleId,
      roleName: result.roleName,
      roleRank: result.roleRank,
      passedAt: timestamp
    });

    await Promise.all([
      this.pendingRef.child(String(robloxUserId)).remove(),
      this.pendingClaimsRef.child(String(robloxUserId)).remove()
    ]);

    console.info(`[recruitment] Roblox ${robloxUserId} enrolled automatically as ${result.roleName}.`);
    return result;
  }
}
