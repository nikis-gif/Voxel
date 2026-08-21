import { randomInt } from "node:crypto";

export const RECRUITMENT_CONFIG = Object.freeze({
  passingScore: 70,
  questionCount: 10,
  sessionTtlMs: 20 * 60 * 1000,
  candidateTtlMs: 45 * 60 * 1000,
  retryCooldownMs: 30 * 1000,
  mainCommunityName: "Exército Brasileiro |EB|",
  questions: Object.freeze([
    {
      id: "grammar",
      prompt: "Como o militar deve se comunicar durante o serviço?",
      options: [
        { id: "grammar_a", label: "Utilizando gramática adequada e evitando abreviações informais." },
        { id: "grammar_b", label: "Usando abreviações como 'vc', 'pq' e 'tmj' para responder mais rápido." },
        { id: "grammar_c", label: "Escrevendo somente em letras maiúsculas em qualquer situação." },
        { id: "grammar_d", label: "Utilizando qualquer forma de escrita desde que a mensagem seja curta." }
      ],
      correctOptionId: "grammar_a"
    },
    {
      id: "civilian",
      prompt: "Quando é permitido abater um civil?",
      options: [
        { id: "civilian_a", label: "Sempre que o civil se aproximar da base." },
        { id: "civilian_b", label: "Somente quando existir uma justificativa válida." },
        { id: "civilian_c", label: "Quando um Soldado solicitar." },
        { id: "civilian_d", label: "Nunca, independentemente da situação." }
      ],
      correctOptionId: "civilian_b"
    },
    {
      id: "leave-base",
      prompt: "Quem possui autorização para sair da base por patente?",
      options: [
        { id: "leave_a", label: "Somente Oficiais e superiores." },
        { id: "leave_b", label: "Qualquer militar após o recrutamento." },
        { id: "leave_c", label: "Graduados ou superiores." },
        { id: "leave_d", label: "Apenas o Comandante." }
      ],
      correctOptionId: "leave_c"
    },
    {
      id: "rank-training",
      prompt: "Quem pode aplicar treinos de patente?",
      options: [
        { id: "training_a", label: "Cabo ou superior." },
        { id: "training_b", label: "Oficiais ou superiores." },
        { id: "training_c", label: "Qualquer Graduado." },
        { id: "training_d", label: "Somente o Comandante." }
      ],
      correctOptionId: "training_b"
    },
    {
      id: "other-institution",
      prompt: "Um militar do EB pode integrar simultaneamente outra instituição militar brasileira?",
      options: [
        { id: "institution_a", label: "Sim, desde que não possua patente alta." },
        { id: "institution_b", label: "Sim, com autorização de um Cabo." },
        { id: "institution_c", label: "Não, isso não é permitido." },
        { id: "institution_d", label: "Somente aos finais de semana." }
      ],
      correctOptionId: "institution_c"
    },
    {
      id: "free-rank",
      prompt: "O que deve ser feito em relação a promoções e 'free-rank'?",
      options: [
        { id: "freerank_a", label: "Solicitar apenas uma vez por dia." },
        { id: "freerank_b", label: "Pedir somente a Oficiais." },
        { id: "freerank_c", label: "Não solicitar promoção, patente gratuita ou 'free-rank'." },
        { id: "freerank_d", label: "Solicitar quando acreditar que merece subir de patente." }
      ],
      correctOptionId: "freerank_c"
    },
    {
      id: "sts",
      prompt: "O que significa o comando 'STS!'?",
      options: [
        { id: "sts_a", label: "Formar uma fila única atrás do instrutor." },
        { id: "sts_b", label: "Posicionar-se ombro a ombro com os demais militares nas marcações indicadas." },
        { id: "sts_c", label: "Formar duas colunas paralelas." },
        { id: "sts_d", label: "Assumir a posição de descansar." }
      ],
      correctOptionId: "sts_b"
    },
    {
      id: "double-line",
      prompt: "Como deve ser executado o comando 'FILA DUPLA!'?",
      options: [
        { id: "double_a", label: "Duas colunas paralelas atrás do instrutor." },
        { id: "double_b", label: "Uma coluna única na frente do instrutor." },
        { id: "double_c", label: "Um formato de V ao redor do instrutor." },
        { id: "double_d", label: "Todos lado a lado em uma única linha." }
      ],
      correctOptionId: "double_a"
    },
    {
      id: "rear-turn",
      prompt: "O que deve ser feito em 'RETAGUARDA, VOLVER!'?",
      options: [
        { id: "rear_a", label: "Girar para o lado esquerdo." },
        { id: "rear_b", label: "Girar para o lado direito." },
        { id: "rear_c", label: "Retornar à orientação inicial do instrutor." },
        { id: "rear_d", label: "Girar para a direção oposta, ficando de costas para a posição anterior." }
      ],
      correctOptionId: "rear_d"
    },
    {
      id: "march",
      prompt: "Qual é a ação correta ao receber o comando 'MARCHEM!'?",
      options: [
        { id: "march_a", label: "Interromper a marcha e permanecer na posição." },
        { id: "march_b", label: "Iniciar o deslocamento mantendo a formação estabelecida." },
        { id: "march_c", label: "Preparar-se e aguardar outra ordem." },
        { id: "march_d", label: "Sair da formação e correr até o instrutor." }
      ],
      correctOptionId: "march_b"
    },
    {
      id: "ppf",
      prompt: "O que significa 'PPF!'?",
      options: [
        { id: "ppf_a", label: "Permissão Para Falar." },
        { id: "ppf_b", label: "Permissão Para Assistir." },
        { id: "ppf_c", label: "Permissão Para Sair." },
        { id: "ppf_d", label: "Posição Para Formação." }
      ],
      correctOptionId: "ppf_a"
    },
    {
      id: "salute",
      prompt: "O que deve ser feito ao comando 'CONTINÊNCIA!'?",
      options: [
        { id: "salute_a", label: "Assumir imediatamente a posição de descansar." },
        { id: "salute_b", label: "Retirar qualquer item das mãos e permanecer à vontade." },
        { id: "salute_c", label: "Assumir a posição de continência." },
        { id: "salute_d", label: "Formar fila única." }
      ],
      correctOptionId: "salute_c"
    },
    {
      id: "jumping-jacks",
      prompt: "Como deve ser feita a contagem de JJ's quando uma quantidade for determinada?",
      options: [
        { id: "jj_a", label: "Escrever somente o último número solicitado." },
        { id: "jj_b", label: "Escrever cada número em letras minúsculas e sem pontuação." },
        { id: "jj_c", label: "Escrever cada número até o valor solicitado, pular após cada contagem e usar letras maiúsculas, espaço após o número e '!' ao final." },
        { id: "jj_d", label: "Contar somente por voz e sem pular." }
      ],
      correctOptionId: "jj_c"
    },
    {
      id: "false-command",
      prompt: "Como identificar um comando falso durante uma atividade?",
      options: [
        { id: "false_a", label: "Todo comando dado rapidamente é falso." },
        { id: "false_b", label: "Qualquer alteração na escrita ou no comando oficial deve ser tratada como comando falso." },
        { id: "false_c", label: "Somente comandos de marcha podem ser falsos." },
        { id: "false_d", label: "O comando só é falso quando o instrutor avisar depois." }
      ],
      correctOptionId: "false_b"
    },
    {
      id: "promotion-capacity",
      prompt: "Qual é o objetivo da Capacitação de Patente (CP)?",
      options: [
        { id: "cp_a", label: "Permitir várias promoções no mesmo dia." },
        { id: "cp_b", label: "Definir um intervalo mínimo entre promoções e tornar a progressão mais gradual." },
        { id: "cp_c", label: "Substituir os treinamentos de patente." },
        { id: "cp_d", label: "Liberar promoção automática por tempo online." }
      ],
      correctOptionId: "cp_b"
    }
  ])
});

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createRecruitmentQuestionSet() {
  const selected = shuffle(RECRUITMENT_CONFIG.questions).slice(0, RECRUITMENT_CONFIG.questionCount);
  return selected.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: shuffle(question.options).map((option) => ({ id: option.id, label: option.label }))
  }));
}

export function getRecruitmentQuestion(questionId) {
  return RECRUITMENT_CONFIG.questions.find((question) => question.id === questionId) ?? null;
}
