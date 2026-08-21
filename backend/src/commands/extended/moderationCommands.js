import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from "discord.js";

function command(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild);
}

function admin(builder) {
  return builder.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}

export const extendedModerationCommands = Object.freeze([
  command("mute", "Aplica timeout temporário em um membro.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true))
    .addIntegerOption((o) => o.setName("minutos").setDescription("Duração entre 1 e 40320 minutos.").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo da ação.").setMaxLength(300)),
  command("unmute", "Remove o timeout atual de um membro.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo da ação.").setMaxLength(300)),
  command("kick", "Expulsa um membro do servidor e registra a ação.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo da expulsão.").setMaxLength(300)),
  command("warns", "Mostra as advertências registradas para um membro.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro consultado.").setRequired(true)),
  command("remove-warning", "Remove uma advertência específica pelo ID.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true))
    .addStringOption((o) => o.setName("id").setDescription("ID da advertência.").setRequired(true)),
  admin(command("reset-warnings", "Remove todas as advertências de um membro."))
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true)),
  command("history", "Mostra o histórico completo de moderação de um membro.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro consultado.").setRequired(true)),
  admin(command("modlogs", "Configura o canal de logs administrativos do Voxel."))
    .addChannelOption((o) => o.setName("canal").setDescription("Canal de logs; deixe vazio para remover.")),
  command("slowmode", "Altera o modo lento do canal atual.")
    .addIntegerOption((o) => o.setName("segundos").setDescription("0 desativa; máximo 21600.").setMinValue(0).setMaxValue(21600).setRequired(true)),
  command("purge-user", "Remove mensagens recentes de um membro no canal atual.")
    .addUserOption((o) => o.setName("usuario").setDescription("Autor das mensagens.").setRequired(true))
    .addIntegerOption((o) => o.setName("quantidade").setDescription("Máximo de mensagens a procurar.").setMinValue(1).setMaxValue(100).setRequired(true)),
  admin(command("nickname", "Altera manualmente o apelido de um membro."))
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true))
    .addStringOption((o) => o.setName("apelido").setDescription("Novo apelido; vazio remove.").setMaxLength(32)),
  command("sync-nickname", "Força a atualização do apelido usando o perfil do jogo.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true)),
  command("sync-roles", "Força a sincronização de cargos pelo perfil atual do jogo.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true)),
  command("sync-me", "Ressincroniza seus próprios cargos e apelido com o perfil atual do jogo."),
  admin(command("sync-all", "Ressincroniza todos os membros verificados do servidor.")),
  command("player-info", "Mostra vínculo, perfil militar e histórico de um jogador.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro consultado.").setRequired(true)),
  command("quarantine", "Remove cargos gerenciáveis e aplica contenção temporária.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true))
    .addIntegerOption((o) => o.setName("horas").setDescription("Duração da contenção.").setMinValue(1).setMaxValue(672).setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo da contenção.").setMaxLength(300)),
  command("unquarantine", "Remove a quarentena e sincroniza novamente o membro.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true)),
  command("lockdown", "Bloqueia os canais de texto do servidor em uma emergência.")
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo do lockdown.").setMaxLength(300)),
  command("unlockdown", "Restaura as permissões salvas antes do lockdown."),
  command("security-status", "Mostra o estado do Anti-Raid, Anti-Nuke e contenções."),
  admin(command("anti-raid", "Ativa, desativa ou configura o Anti-Raid."))
    .addStringOption((o) => o.setName("acao").setDescription("Ação desejada.").setRequired(true).addChoices(
      { name: "Ativar", value: "enable" }, { name: "Desativar", value: "disable" }, { name: "Configurar", value: "config" }
    ))
    .addIntegerOption((o) => o.setName("limite").setDescription("Entradas necessárias para ativar.").setMinValue(3).setMaxValue(50)),
  admin(command("anti-nuke", "Ativa, desativa ou configura o Anti-Nuke."))
    .addStringOption((o) => o.setName("acao").setDescription("Ação desejada.").setRequired(true).addChoices(
      { name: "Ativar", value: "enable" }, { name: "Desativar", value: "disable" }, { name: "Configurar", value: "config" }
    ))
    .addIntegerOption((o) => o.setName("sensibilidade").setDescription("Pontuação necessária para conter.").setMinValue(3).setMaxValue(30)),
  command("security-whitelist", "Gerencia usuários confiáveis do Anti-Nuke.")
    .addStringOption((o) => o.setName("acao").setDescription("Adicionar, remover ou listar.").setRequired(true).addChoices(
      { name: "Adicionar", value: "add" }, { name: "Remover", value: "remove" }, { name: "Listar", value: "list" }
    ))
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário para adicionar ou remover.")),
  command("security-incidents", "Lista incidentes recentes do Anti-Raid e Anti-Nuke."),
  command("security-case", "Mostra os detalhes de um incidente de segurança.")
    .addStringOption((o) => o.setName("id").setDescription("ID do incidente.").setRequired(true)),
  command("ticket-close", "Fecha um ticket pelo canal ou pelo usuário.")
    .addUserOption((o) => o.setName("usuario").setDescription("Dono do ticket; opcional no próprio ticket.")),
  command("ticket-add", "Adiciona um membro ao ticket atual.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro a adicionar.").setRequired(true)),
  command("ticket-remove", "Remove um membro adicional do ticket atual.")
    .addUserOption((o) => o.setName("usuario").setDescription("Membro a remover.").setRequired(true)),
  command("ticket-claim", "Assume a responsabilidade pelo ticket atual."),
  command("ticket-list", "Lista tickets abertos e seus responsáveis."),
  command("report", "Envia uma denúncia privada para a equipe de moderação.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário denunciado.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Explique o problema.").setRequired(true).setMaxLength(800))
    .addAttachmentOption((o) => o.setName("prova").setDescription("Imagem ou arquivo de prova.")),
  command("community-members", "Lista membros de uma comunidade do jogo.")
    .addStringOption((o) => o.setName("comunidade").setDescription("Nome da comunidade.").setRequired(true)),
  command("community-ranks", "Mostra os cargos disponíveis de uma comunidade.")
    .addStringOption((o) => o.setName("comunidade").setDescription("Nome da comunidade.").setRequired(true)),
  command("community-profile", "Mostra um perfil completo de uma comunidade do jogo.")
    .addStringOption((o) => o.setName("comunidade").setDescription("Nome da comunidade.").setRequired(true)),
  admin(command("force-unverify", "Desvincula forçadamente a conta Roblox de outro membro."))
    .addUserOption((o) => o.setName("usuario").setDescription("Membro alvo.").setRequired(true)),
  admin(command("verified-list", "Lista contas verificadas e sua última sincronização.")),
  command("reward-history", "Mostra o histórico de recompensas externas.")
    .addUserOption((o) => o.setName("usuario").setDescription("Outro usuário; administradores apenas.")),
  command("revoke-reward", "Revoga um código de recompensa ainda não utilizado.")
    .addStringOption((o) => o.setName("codigo").setDescription("Código a revogar.").setRequired(true)),
  command("give-points", "Gera uma recompensa de Points para um usuário verificado.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário alvo.").setRequired(true))
    .addIntegerOption((o) => o.setName("quantidade").setDescription("Points a entregar.").setMinValue(1).setMaxValue(1000000).setRequired(true)),
  command("give-money", "Gera uma recompensa de Dinheiro para um usuário verificado.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuário alvo.").setRequired(true))
    .addIntegerOption((o) => o.setName("quantidade").setDescription("Dinheiro a entregar.").setMinValue(1).setMaxValue(100000000).setRequired(true)),
  command("server-status", "Mostra o status operacional do Voxel e serviços conectados."),
  command("bot-info", "Mostra versão, uptime e estatísticas do Voxel."),
  command("help", "Mostra os comandos disponíveis organizados por categoria.")
]);
