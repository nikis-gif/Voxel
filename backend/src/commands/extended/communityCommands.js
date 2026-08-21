import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} from "discord.js";

function command(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild);
}

export const communityExperienceCommands = Object.freeze([
  command("economy", "Daily, ranking, loja, inventário e transferências.")
    .addSubcommand((s) => s.setName("daily").setDescription("Recebe a recompensa diária e mantém sua sequência."))
    .addSubcommand((s) => s.setName("rank").setDescription("Mostra seu nível, XP e economia sincronizada."))
    .addSubcommand((s) => s.setName("leaderboard").setDescription("Mostra o ranking de atividade.").addStringOption((o) => o.setName("tipo").setDescription("Ranking desejado.").addChoices(
      { name: "XP", value: "xp" }, { name: "Playtime", value: "playtime" }, { name: "Presença", value: "presence" }
    )))
    .addSubcommand((s) => s.setName("shop").setDescription("Mostra a loja de itens virtuais do Voxel."))
    .addSubcommand((s) => s.setName("inventory").setDescription("Mostra seu inventário do Voxel."))
    .addSubcommand((s) => s.setName("transfer-points").setDescription("Transfere Points para outro usuário verificado.")
      .addUserOption((o) => o.setName("usuario").setDescription("Destinatário.").setRequired(true))
      .addIntegerOption((o) => o.setName("quantidade").setDescription("Quantidade de Points.").setMinValue(1).setMaxValue(100000).setRequired(true))),

  command("game", "Informações ao vivo e presença no jogo.")
    .addSubcommand((s) => s.setName("roblox").setDescription("Mostra o perfil Roblox vinculado.").addUserOption((o) => o.setName("usuario").setDescription("Usuário; vazio usa você.")))
    .addSubcommand((s) => s.setName("online").setDescription("Lista jogadores verificados atualmente online."))
    .addSubcommand((s) => s.setName("servers").setDescription("Mostra os servidores Roblox ativos."))
    .addSubcommand((s) => s.setName("playtime").setDescription("Mostra seu tempo total no jogo."))
    .addSubcommand((s) => s.setName("presence").setDescription("Mostra sua presença recente no jogo."))
    .addSubcommand((s) => s.setName("top-playtime").setDescription("Ranking de tempo total no jogo."))
    .addSubcommand((s) => s.setName("top-presence").setDescription("Ranking de presença do dia."))
    .addSubcommand((s) => s.setName("activity").setDescription("Mostra atividade combinada Discord e Roblox.")),

  command("community-hub", "Recursos interativos do Sistema de Comunidades.")
    .addSubcommand((s) => s.setName("community").setDescription("Mostra uma comunidade.").addStringOption((o) => o.setName("nome").setDescription("Nome da comunidade.").setRequired(true)))
    .addSubcommand((s) => s.setName("my-communities").setDescription("Mostra suas comunidades sincronizadas."))
    .addSubcommand((s) => s.setName("ranking").setDescription("Ranking de presença de uma comunidade.").addStringOption((o) => o.setName("nome").setDescription("Nome da comunidade.").setRequired(true)))
    .addSubcommand((s) => s.setName("random-member").setDescription("Sorteia um membro da comunidade.").addStringOption((o) => o.setName("nome").setDescription("Nome da comunidade.").setRequired(true))),

  command("events", "Eventos, inscrições, equipes e sorteios internos.")
    .addSubcommand((s) => s.setName("create").setDescription("Cria um evento.")
      .addStringOption((o) => o.setName("titulo").setDescription("Título do evento.").setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName("descricao").setDescription("Descrição.").setRequired(true).setMaxLength(800))
      .addIntegerOption((o) => o.setName("minutos").setDescription("Começa em quantos minutos.").setMinValue(1).setMaxValue(10080).setRequired(true))
      .addIntegerOption((o) => o.setName("limite").setDescription("Máximo de participantes; 0 ilimitado.").setMinValue(0).setMaxValue(500)))
    .addSubcommand((s) => s.setName("join").setDescription("Participa de um evento.").addStringOption((o) => o.setName("id").setDescription("ID do evento.").setRequired(true)))
    .addSubcommand((s) => s.setName("leave").setDescription("Sai de um evento.").addStringOption((o) => o.setName("id").setDescription("ID do evento.").setRequired(true)))
    .addSubcommand((s) => s.setName("list").setDescription("Lista eventos futuros."))
    .addSubcommand((s) => s.setName("random").setDescription("Sorteia participantes de um evento.").addStringOption((o) => o.setName("id").setDescription("ID do evento.").setRequired(true)).addIntegerOption((o) => o.setName("quantidade").setDescription("Número de sorteados.").setMinValue(1).setMaxValue(50).setRequired(true)))
    .addSubcommand((s) => s.setName("team").setDescription("Divide participantes de um evento em equipes.").addStringOption((o) => o.setName("id").setDescription("ID do evento.").setRequired(true)).addIntegerOption((o) => o.setName("equipes").setDescription("Quantidade de equipes.").setMinValue(2).setMaxValue(10).setRequired(true)))
    .addSubcommand((s) => s.setName("poll").setDescription("Cria uma votação rápida no canal.")
      .addStringOption((o) => o.setName("pergunta").setDescription("Pergunta.").setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName("opcoes").setDescription("Opções separadas por |, de 2 a 5.").setRequired(true).setMaxLength(500))),

  command("social", "Ferramentas sociais e utilidades leves.")
    .addSubcommand((s) => s.setName("coinflip").setDescription("Joga cara ou coroa."))
    .addSubcommand((s) => s.setName("dice").setDescription("Rola dados no formato NdM.").addStringOption((o) => o.setName("dados").setDescription("Ex.: 2d6.").setRequired(true)))
    .addSubcommand((s) => s.setName("random").setDescription("Sorteia um número.").addIntegerOption((o) => o.setName("min").setDescription("Mínimo.").setRequired(true)).addIntegerOption((o) => o.setName("max").setDescription("Máximo.").setRequired(true)))
    .addSubcommand((s) => s.setName("choose").setDescription("Escolhe entre opções.").addStringOption((o) => o.setName("opcoes").setDescription("Opções separadas por |.").setRequired(true)))
    .addSubcommand((s) => s.setName("8ball").setDescription("Responde uma pergunta de forma aleatória.").addStringOption((o) => o.setName("pergunta").setDescription("Pergunta.").setRequired(true)))
    .addSubcommand((s) => s.setName("avatar").setDescription("Mostra o avatar de um usuário.").addUserOption((o) => o.setName("usuario").setDescription("Usuário; vazio usa você.")))
    .addSubcommand((s) => s.setName("banner").setDescription("Mostra o banner de um usuário.").addUserOption((o) => o.setName("usuario").setDescription("Usuário; vazio usa você.")))
    .addSubcommand((s) => s.setName("userinfo").setDescription("Mostra informações públicas de um membro.").addUserOption((o) => o.setName("usuario").setDescription("Usuário; vazio usa você.")))
    .addSubcommand((s) => s.setName("birthday").setDescription("Configura seu aniversário em DD/MM.").addStringOption((o) => o.setName("data").setDescription("DD/MM ou remover.").setRequired(true)))
    .addSubcommand((s) => s.setName("quote").setDescription("Transforma uma mensagem em um card.").addStringOption((o) => o.setName("mensagem_id").setDescription("ID da mensagem no canal atual.").setRequired(true)))
    .addSubcommand((s) => s.setName("afk").setDescription("Define ou remove seu estado AFK.").addStringOption((o) => o.setName("motivo").setDescription("Motivo; use remover para limpar.")))
    .addSubcommand((s) => s.setName("remember").setDescription("Salva uma pequena nota privada.").addStringOption((o) => o.setName("nota").setDescription("Nota ou remover.").setRequired(true).setMaxLength(300)))
    .addSubcommand((s) => s.setName("timezone").setDescription("Configura seu UTC de -12 a +14.").addIntegerOption((o) => o.setName("utc").setDescription("Offset UTC.").setMinValue(-12).setMaxValue(14).setRequired(true)))
    .addSubcommand((s) => s.setName("ping-role").setDescription("Ativa ou remove uma notificação opcional.").addStringOption((o) => o.setName("tipo").setDescription("Categoria.").setRequired(true).addChoices(
      { name: "Eventos", value: "events" }, { name: "Recrutamento", value: "recruitment" }, { name: "Atualizações", value: "updates" }, { name: "Comunidades", value: "communities" }
    ))),

  command("progress", "Conquistas, distintivos e missões.")
    .addSubcommand((s) => s.setName("profile-card").setDescription("Mostra seu cartão de progressão Voxel."))
    .addSubcommand((s) => s.setName("achievements").setDescription("Mostra suas conquistas desbloqueadas."))
    .addSubcommand((s) => s.setName("badges").setDescription("Mostra seus distintivos do Voxel."))
    .addSubcommand((s) => s.setName("missions").setDescription("Mostra missões diárias disponíveis."))
    .addSubcommand((s) => s.setName("claim-mission").setDescription("Resgata uma missão concluída.").addStringOption((o) => o.setName("missao").setDescription("ID da missão.").setRequired(true))),

  command("giveaway", "Sorteios com participação por botão.")
    .addSubcommand((s) => s.setName("create").setDescription("Cria um sorteio.")
      .addStringOption((o) => o.setName("premio").setDescription("Prêmio.").setRequired(true).setMaxLength(200))
      .addIntegerOption((o) => o.setName("minutos").setDescription("Duração em minutos.").setMinValue(1).setMaxValue(10080).setRequired(true))
      .addIntegerOption((o) => o.setName("vencedores").setDescription("Quantidade de vencedores.").setMinValue(1).setMaxValue(10).setRequired(true)))
    .addSubcommand((s) => s.setName("reroll").setDescription("Sorteia novos vencedores.").addStringOption((o) => o.setName("id").setDescription("ID do sorteio.").setRequired(true))),

  command("quiz", "Quiz e trivia baseados nos dados do EB.")
    .addSubcommand((s) => s.setName("start").setDescription("Inicia uma pergunta de quiz."))
    .addSubcommand((s) => s.setName("trivia").setDescription("Gera uma pergunta rápida de trivia.")),

  command("suggest", "Sugestões da comunidade e acompanhamento.")
    .addSubcommand((s) => s.setName("send").setDescription("Envia uma sugestão.").addStringOption((o) => o.setName("texto").setDescription("Sugestão.").setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName("list").setDescription("Lista sugestões recentes.")),

  command("fun", "Interações leves entre membros.")
    .addSubcommand((s) => s.setName("duel").setDescription("Desafio amigável baseado em sorte.").addUserOption((o) => o.setName("usuario").setDescription("Oponente.").setRequired(true)))
    .addSubcommand((s) => s.setName("ship").setDescription("Calcula compatibilidade divertida entre dois usuários.").addUserOption((o) => o.setName("usuario").setDescription("Segundo usuário.").setRequired(true))),

  command("server", "Estatísticas gerais do Discord e do jogo.")
    .addSubcommand((s) => s.setName("stats").setDescription("Mostra estatísticas gerais da comunidade."))
]);
