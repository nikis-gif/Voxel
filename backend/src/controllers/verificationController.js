const MAX_USERNAME_LENGTH = 32;
const MAX_DISPLAY_NAME_LENGTH = 64;
const MAX_LABEL_LENGTH = 80;
const MAX_ROLE_ID_LENGTH = 80;
const MAX_COMMUNITY_ID_LENGTH = 80;
const DIVISION_KEYS = new Set(["BAC", "BFEsp", "BPE", "CIGS", "CIE"]);

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readRank(value) {
  return Number.isInteger(value) && value >= 0 && value <= 19 ? value : 0;
}

function sanitizeProfile(body) {
  const userId = Number(body?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    const error = new Error("Invalid Roblox user id");
    error.statusCode = 400;
    throw error;
  }

  const username = cleanString(body?.username, MAX_USERNAME_LENGTH);
  const displayName = cleanString(body?.displayName, MAX_DISPLAY_NAME_LENGTH);
  if (!username) {
    const error = new Error("Invalid Roblox username");
    error.statusCode = 400;
    throw error;
  }

  const militaryInput = body?.military ?? {};
  if (militaryInput.ready !== true) {
    const error = new Error("Os dados militares ainda estão carregando. Tente novamente em alguns segundos.");
    error.statusCode = 409;
    throw error;
  }

  const military = {
    ready: true,
    isMember: militaryInput.isMember === true,
    rank: readRank(militaryInput.rank),
    label: cleanString(militaryInput.label, MAX_LABEL_LENGTH),
    roleId: cleanString(militaryInput.roleId, MAX_ROLE_ID_LENGTH)
  };

  const divisionInput = body?.division ?? {};
  const divisionKey = cleanString(divisionInput.key, 16);
  const division = {
    isMember: military.isMember && divisionInput.isMember === true && DIVISION_KEYS.has(divisionKey),
    key: DIVISION_KEYS.has(divisionKey) ? divisionKey : "",
    communityId: cleanString(divisionInput.communityId, MAX_COMMUNITY_ID_LENGTH),
    rank: readRank(divisionInput.rank),
    label: cleanString(divisionInput.label, MAX_LABEL_LENGTH),
    roleId: cleanString(divisionInput.roleId, MAX_ROLE_ID_LENGTH)
  };

  if (!division.isMember) {
    division.key = "";
    division.communityId = "";
    division.rank = 0;
    division.label = "";
    division.roleId = "";
  }

  return { userId, username, displayName, military, division };
}

export function createVerificationController(codeStore, discordVerificationService) {
  return {
    generateCode(req, res, next) {
      try {
        const profile = sanitizeProfile(req.body);
        const generated = codeStore.generate(profile);

        res.status(201).json({
          success: true,
          data: generated
        });
      } catch (error) {
        next(error);
      }
    },

    async syncProfile(req, res, next) {
      try {
        const profile = sanitizeProfile(req.body);
        const result = await discordVerificationService.syncRobloxProfile(profile);

        res.status(200).json({
          success: true,
          data: result
        });
      } catch (error) {
        next(error);
      }
    }
  };
}
