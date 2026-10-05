/**
 * The dashboard in BRAZILIAN PORTUGUESE — partial on purpose, exactly as the
 * Spanish one is, and growing section by section.
 *
 * Everything this file does not name yet falls back to the ENGLISH dictionary
 * (lib/i18n/dashboard/merge.ts says why English and not Hebrew): an untranslated
 * screen shows English words in a left-to-right layout, which a Brazilian reader
 * can work with, instead of Hebrew in a right-to-left one, which they cannot.
 *
 * REGISTER. Brazil, addressed as `você`, which is what Brazilian SaaS uses in
 * writing. "Site" rather than Portugal's "sítio", "e-mail" with the hyphen, and
 * the Brazilian spellings throughout (`acompanhamento`, not `seguimento`).
 *
 * TERMS WE DO NOT TRANSLATE, because the reader looks for them in Google's own
 * words: "Google Search Console", "Google Maps", "SEO". "Keyword" is
 * "palavra-chave", which every Brazilian SEO tool uses.
 *
 * This wave translates the CHROME — the rail, the workspace switcher, the shared
 * contact menu and the content rail's own lines — because those are on every
 * screen, so they are what makes the dashboard Portuguese at all.
 */
import type { DashboardDictionary } from './he'
import type { DeepPartial } from './merge'

export const dashboardPtBR: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Logotipo da Go Top SEO',
    groupMain: 'Principal',
    groupResearch: 'Pesquisa e conteúdo',
    groupMonitoring: 'Acompanhamento e relatórios',
    groupAccount: 'Conta',
    dashboard: 'Painel',
    clients: 'Clientes',
    projects: 'Sites',
    keywords: 'Palavras-chave',
    keywordResearch: 'Buscar palavras-chave',
    siteLinks: 'Links',
    mapsPosts: 'Publicações no Google Maps',
    aiVisibility: 'Visibilidade em IA',
    projectSettings: 'Configurações do site',
    reports: 'Relatórios',
    siteHealth: 'Saúde do site',
    billing: 'Pagamentos',
    system: 'Sistema',
    articleManagement: 'Artigos do site',
    connectionStatus: 'Status da conexão',
    errorLogs: 'Registro de erros',
    support: 'Suporte pelo WhatsApp',
    supportAria: 'Suporte pelo WhatsApp (abre em uma nova janela)',
    logout: 'Sair',
    navLabel: 'Navegação principal',
    skipToContent: 'Ir para o conteúdo',
    openMenu: 'Abrir o menu',
    closeMenu: 'Fechar o menu',
    themeLabel: 'Tema',
    languageLabel: 'Idioma',
  },
  workspace: {
    label: 'Site:',
    unnamed: 'Sem nome',
    loading: 'Carregando seus sites…',
    loadError: 'Não conseguimos carregar seus sites. Tente de novo',
    searchPlaceholder: 'Buscar sites…',
    noMatches: 'Nenhum site com esse nome',
    create: 'Novo site',
    createFirst: 'Crie seu primeiro site',
    manage: 'Gerenciar sites',
    projectsLoadError: 'Não conseguimos carregar seus sites agora. É temporário.',
    retry: 'Tentar de novo',
    loadingProject: 'Carregando o site…',
    noProjectTitle: 'Ainda não há nenhum site',
    noProjectBody: 'Cada site tem seu próprio painel, suas palavras-chave e suas configurações. Assim que você criar um, todas as telas mostram os dados dele.',
    noProjectCta: 'Criar um site',
    projectLoadError: 'Não conseguimos carregar este site',
    projectMissing: 'Não encontramos este site. Escolha outro no seletor acima.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? 'Seu plano atual não inclui sites.' : `Você já está usando todos os sites do seu plano (${used} de ${limit}).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'Mudar de plano',
    listLabel: 'Seus sites',
  },
  contact: {
    label: 'Fale com a gente',
    menuLabel: 'Contato',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `Olá, preciso de ajuda com ${domain}` : 'Olá, preciso de ajuda'),
    phone: (number: string) => `Ligar para ${number}`,
    email: (address: string) => `Escrever para ${address}`,
    opensNewTab: '(abre em uma nova aba)',
  },
  // The content rail's own lines, for the same reason they are in the Spanish
  // file: they are the last English words left in a rail that is otherwise
  // Portuguese, and a rail that is nine-tenths translated reads as broken
  // rather than as unfinished.
  contentHub: {
    selectProjectMessage: 'Escolha um projeto no seletor acima para ver e gerenciar o conteúdo dele.',
    noProjectsTitle: 'Crie seu primeiro projeto para usar esta ferramenta',
    projectsLoadError: 'Não conseguimos carregar seus projetos agora. É temporário.',
    projectsLoadRetry: 'Tentar de novo',
    projectsLoading: 'Carregando seus projetos…',
    noProjectsCta: 'Criar projeto',
  },
}
