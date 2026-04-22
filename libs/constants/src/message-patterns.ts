/**
 * RabbitMQ message patterns for event-driven communication
 */
export enum MessagePattern {
  // User events
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',

  // User RPC requests (Gateway -> Service)
  USER_GET_AUTH_METHODS = 'user.get.auth.methods',
  USER_GET_ME = 'user.get.me',
  USER_GET_ME_WALLET = 'user.get.me.wallet',
  USER_GET_ALL = 'user.get.all',

  // User RPC responses (Service -> Gateway)
  USER_GET_AUTH_METHODS_RESPONSE = 'user.get.auth.methods.response',
  USER_GET_ME_RESPONSE = 'user.get.me.response',
  USER_GET_ME_WALLET_RESPONSE = 'user.get.me.wallet.response',
  USER_GET_ALL_RESPONSE = 'user.get.all.response',

  // Job events
  JOB_CREATED = 'job.created',
  JOB_UPDATED = 'job.updated',
  JOB_DELETED = 'job.deleted',
  JOB_APPLIED = 'job.applied',
  JOB_COMPLETED = 'job.completed',
  JOB_SET_ACTIVE = 'job.set.active',

  // On-chain contract completion
  ONCHAIN_CONTRACT_COMPLETE = 'onchain.contract.complete',
  ONCHAIN_CONTRACT_COMPLETE_RESPONSE = 'onchain.contract.complete.response',

  // Job RPC requests (Gateway -> Service)
  JOB_GET_ALL = 'job.get.all',
  JOB_GET_ONE = 'job.get.one',
  JOB_CREATE = 'job.create',
  JOB_GET_MY_JOBS = 'job.get.my',
  JOB_UPDATE = 'job.update',
  JOB_UPDATE_STATUS = 'job.update.status',
  JOB_SAVE_DRAFT = 'job.save.draft',
  JOB_GET_DRAFTS = 'job.get.drafts',
  JOB_BOOKMARK = 'job.bookmark',
  JOB_UNBOOKMARK = 'job.unbookmark',
  JOB_GET_BOOKMARKS = 'job.get.bookmarks',
  JOB_GET_CLIENT_STATS = 'job.get.client.stats',

  // Job RPC responses (Service -> Gateway)
  JOB_GET_ALL_RESPONSE = 'job.get.all.response',
  JOB_GET_ONE_RESPONSE = 'job.get.one.response',
  JOB_CREATE_RESPONSE = 'job.create.response',
  JOB_GET_MY_JOBS_RESPONSE = 'job.get.my.response',
  JOB_UPDATE_RESPONSE = 'job.update.response',
  JOB_UPDATE_STATUS_RESPONSE = 'job.update.status.response',
  JOB_SAVE_DRAFT_RESPONSE = 'job.save.draft.response',
  JOB_GET_DRAFTS_RESPONSE = 'job.get.drafts.response',
  JOB_BOOKMARK_RESPONSE = 'job.bookmark.response',
  JOB_UNBOOKMARK_RESPONSE = 'job.unbookmark.response',
  JOB_GET_BOOKMARKS_RESPONSE = 'job.get.bookmarks.response',
  JOB_GET_CLIENT_STATS_RESPONSE = 'job.get.client.stats.response',

  // Escrow events
  ESCROW_CREATED = 'escrow.created',
  ESCROW_FUNDED = 'escrow.funded',
  ESCROW_RELEASED = 'escrow.released',
  ESCROW_REFUNDED = 'escrow.refunded',

  // Escrow RPC requests (Gateway -> Service)
  ESCROW_FUND = 'escrow.fund',
  ESCROW_TOPUP = 'escrow.topup',
  ESCROW_WITHDRAW = 'escrow.withdraw',
  ESCROW_RELEASE = 'escrow.release',
  ESCROW_REFUND = 'escrow.refund',
  ESCROW_GET = 'escrow.get',
  ESCROW_CONFIRM = 'escrow.confirm',

  // Escrow RPC responses (Service -> Gateway)
  ESCROW_FUND_RESPONSE = 'escrow.fund.response',
  ESCROW_TOPUP_RESPONSE = 'escrow.topup.response',
  ESCROW_WITHDRAW_RESPONSE = 'escrow.withdraw.response',
  ESCROW_RELEASE_RESPONSE = 'escrow.release.response',
  ESCROW_REFUND_RESPONSE = 'escrow.refund.response',
  ESCROW_GET_RESPONSE = 'escrow.get.response',
  ESCROW_CONFIRM_RESPONSE = 'escrow.confirm.response',

  // Launchpad events
  LAUNCHPAD_CREATED = 'launchpad.created',
  LAUNCHPAD_FUNDED = 'launchpad.funded',
  LAUNCHPAD_COMPLETED = 'launchpad.completed',

  // Launchpad chat RPC requests (Gateway -> Launchpad Service)
  LAUNCHPAD_CONVERSATIONS = 'launchpad.conversations',
  LAUNCHPAD_CONVERSATIONS_RESPONSE = 'launchpad.conversations.response',

  // Follow RPC requests (Gateway -> Launchpad Service)
  FOLLOW = 'follow',
  UNFOLLOW = 'unfollow',
  FOLLOW_CHECK = 'follow.check',

  // Follow RPC responses (Launchpad Service -> Gateway)
  FOLLOW_RESPONSE = 'follow.response',
  UNFOLLOW_RESPONSE = 'unfollow.response',
  FOLLOW_CHECK_RESPONSE = 'follow.check.response',

  // DeFi Profile RPC requests (Gateway -> Launchpad Service)
  DEFI_PROFILE_UPSERT = 'defi.profile.upsert',
  DEFI_PROFILE_GET = 'defi.profile.get',

  // DeFi Profile RPC responses (Launchpad Service -> Gateway)
  DEFI_PROFILE_UPSERT_RESPONSE = 'defi.profile.upsert.response',
  DEFI_PROFILE_GET_RESPONSE = 'defi.profile.get.response',

  // Token RPC requests (Gateway -> Launchpad Service)
  TOKEN_CREATE = 'token.create',
  TOKEN_CONFIRM = 'token.confirm',
  TOKEN_INITIATE = 'token.initiate',
  TOKEN_GET_MY = 'token.get.my',
  TOKEN_GET_ONE = 'token.get.one',
  TOKEN_GET_ALL = 'token.get.all',

  // Token RPC responses (Launchpad Service -> Gateway)
  TOKEN_CREATE_RESPONSE = 'token.create.response',
  TOKEN_CONFIRM_RESPONSE = 'token.confirm.response',
  TOKEN_INITIATE_RESPONSE = 'token.initiate.response',
  TOKEN_GET_MY_RESPONSE = 'token.get.my.response',
  TOKEN_GET_ONE_RESPONSE = 'token.get.one.response',
  TOKEN_GET_ALL_RESPONSE = 'token.get.all.response',

  // Proposal RPC requests (Gateway -> Service)
  PROPOSAL_CREATE = 'proposal.create',
  PROPOSAL_GET_MY = 'proposal.get.my',
  PROPOSAL_GET_BY_JOB = 'proposal.get.by.job',
  PROPOSAL_GET_ONE = 'proposal.get.one',
  PROPOSAL_GET_BY_CLIENT = 'proposal.get.by.client',
  PROPOSAL_UPDATE_STATUS = 'proposal.update.status',

  // Proposal RPC responses (Service -> Gateway)
  PROPOSAL_CREATE_RESPONSE = 'proposal.create.response',
  PROPOSAL_GET_MY_RESPONSE = 'proposal.get.my.response',
  PROPOSAL_GET_BY_JOB_RESPONSE = 'proposal.get.by.job.response',
  PROPOSAL_GET_ONE_RESPONSE = 'proposal.get.one.response',
  PROPOSAL_GET_BY_CLIENT_RESPONSE = 'proposal.get.by.client.response',
  PROPOSAL_UPDATE_STATUS_RESPONSE = 'proposal.update.status.response',
  PROPOSAL_GET_FREELANCER_STATS = 'proposal.get.freelancer.stats',
  PROPOSAL_GET_FREELANCER_STATS_RESPONSE = 'proposal.get.freelancer.stats.response',
  PROPOSAL_COUNT_BY_JOB = 'proposal.count.by.job',
  PROPOSAL_COUNT_BY_JOB_RESPONSE = 'proposal.count.by.job.response',

  // Freelancer Profile RPC requests (Gateway -> Service)
  FREELANCER_PROFILE_CREATE = 'freelancer.profile.create',
  FREELANCER_PROFILE_UPDATE = 'freelancer.profile.update',
  FREELANCER_PROFILE_GET_ME = 'freelancer.profile.get.me',
  FREELANCER_PROFILE_GET_BY_USER = 'freelancer.profile.get.by.user',

  // Freelancer Profile RPC responses (Service -> Gateway)
  FREELANCER_PROFILE_CREATE_RESPONSE = 'freelancer.profile.create.response',
  FREELANCER_PROFILE_UPDATE_RESPONSE = 'freelancer.profile.update.response',
  FREELANCER_PROFILE_GET_ME_RESPONSE = 'freelancer.profile.get.me.response',
  FREELANCER_PROFILE_GET_BY_USER_RESPONSE = 'freelancer.profile.get.by.user.response',
  FREELANCER_PROFILE_GET_BATCH = 'freelancer.profile.get.batch',
  FREELANCER_PROFILE_GET_BATCH_RESPONSE = 'freelancer.profile.get.batch.response',

  // Client Profile RPC requests (Gateway -> Service)
  CLIENT_PROFILE_CREATE = 'client.profile.create',
  CLIENT_PROFILE_UPDATE = 'client.profile.update',
  CLIENT_PROFILE_GET_ME = 'client.profile.get.me',
  CLIENT_PROFILE_GET_BY_USER = 'client.profile.get.by.user',

  // Client Profile RPC responses (Service -> Gateway)
  CLIENT_PROFILE_CREATE_RESPONSE = 'client.profile.create.response',
  CLIENT_PROFILE_UPDATE_RESPONSE = 'client.profile.update.response',
  CLIENT_PROFILE_GET_ME_RESPONSE = 'client.profile.get.me.response',
  CLIENT_PROFILE_GET_BY_USER_RESPONSE = 'client.profile.get.by.user.response',

  // Proposal acceptance (two-party signing)
  PROPOSAL_ACCEPT = 'proposal.accept',
  PROPOSAL_ACCEPT_RESPONSE = 'proposal.accept.response',

  // On-chain contract creation (escrow-service)
  ONCHAIN_CONTRACT_CREATE = 'onchain.contract.create',
  ONCHAIN_CONTRACT_CREATE_RESPONSE = 'onchain.contract.create.response',
  ONCHAIN_CONTRACT_GET = 'onchain.contract.get',
  ONCHAIN_CONTRACT_GET_RESPONSE = 'onchain.contract.get.response',

  // Fire-and-forget result callbacks (Escrow -> Contract queue, no gateway.response.queue)
  ONCHAIN_CONTRACT_CREATE_RESULT = 'onchain.contract.create.result',
  ONCHAIN_CONTRACT_COMPLETE_RESULT = 'onchain.contract.complete.result',

  // Proposal hired event (fire-and-forget, no response pattern)
  PROPOSAL_HIRED = 'proposal.hired',

  // Contract RPC requests (Gateway -> Service)
  CONTRACT_GET_BY_PROPOSAL = 'contract.get.by.proposal',
  CONTRACT_GET_ONE = 'contract.get.one',
  CONTRACT_GET_MY = 'contract.get.my',

  // Contract RPC responses (Service -> Gateway)
  CONTRACT_GET_BY_PROPOSAL_RESPONSE = 'contract.get.by.proposal.response',
  CONTRACT_GET_ONE_RESPONSE = 'contract.get.one.response',
  CONTRACT_GET_MY_RESPONSE = 'contract.get.my.response',

  // Milestone management RPC requests (Gateway -> Escrow Service)
  MILESTONE_CREATE = 'milestone.create',
  MILESTONE_GET_BY_JOB = 'milestone.get.by.job',
  MILESTONE_GET_ONE = 'milestone.get.one',

  // Milestone management RPC responses (Escrow Service -> Gateway)
  MILESTONE_CREATE_RESPONSE = 'milestone.create.response',
  MILESTONE_GET_BY_JOB_RESPONSE = 'milestone.get.by.job.response',
  MILESTONE_GET_ONE_RESPONSE = 'milestone.get.one.response',

  // Milestone escrow RPC requests (Gateway -> Escrow Service)
  ESCROW_MILESTONE_FUND = 'escrow.milestone.fund',
  ESCROW_MILESTONE_WITHDRAW = 'escrow.milestone.withdraw',
  ESCROW_MILESTONE_RELEASE = 'escrow.milestone.release',
  ESCROW_MILESTONE_REFUND = 'escrow.milestone.refund',
  ESCROW_MILESTONE_CONFIRM = 'escrow.milestone.confirm',
  ESCROW_MILESTONE_TOPUP = 'escrow.milestone.topup',

  // Milestone escrow RPC responses (Escrow Service -> Gateway)
  ESCROW_MILESTONE_FUND_RESPONSE = 'escrow.milestone.fund.response',
  ESCROW_MILESTONE_WITHDRAW_RESPONSE = 'escrow.milestone.withdraw.response',
  ESCROW_MILESTONE_RELEASE_RESPONSE = 'escrow.milestone.release.response',
  ESCROW_MILESTONE_REFUND_RESPONSE = 'escrow.milestone.refund.response',
  ESCROW_MILESTONE_CONFIRM_RESPONSE = 'escrow.milestone.confirm.response',
  ESCROW_MILESTONE_TOPUP_RESPONSE = 'escrow.milestone.topup.response',

  // Platform fee RPC (admin only)
  ESCROW_WITHDRAW_FEES = 'escrow.withdraw.fees',
  ESCROW_WITHDRAW_FEES_RESPONSE = 'escrow.withdraw.fees.response',
  ESCROW_GET_FEE_BALANCE = 'escrow.get.fee.balance',
  ESCROW_GET_FEE_BALANCE_RESPONSE = 'escrow.get.fee.balance.response',

  // Notification events (fire-and-forget)
  NOTIFICATION_SEND = 'notification.send',
  NOTIFICATION_SENT = 'notification.sent',

  // Notification RPC requests (Gateway -> Notification Service)
  NOTIFICATION_GET = 'notification.get',
  NOTIFICATION_MARK_READ = 'notification.mark.read',
  NOTIFICATION_MARK_ALL_READ = 'notification.mark.all.read',
  NOTIFICATION_UNREAD_COUNT = 'notification.unread.count',

  // Notification RPC responses (Notification Service -> Gateway)
  NOTIFICATION_GET_RESPONSE = 'notification.get.response',
  NOTIFICATION_MARK_READ_RESPONSE = 'notification.mark.read.response',
  NOTIFICATION_MARK_ALL_READ_RESPONSE = 'notification.mark.all.read.response',
  NOTIFICATION_UNREAD_COUNT_RESPONSE = 'notification.unread.count.response',

  // Chat RPC requests (Gateway -> Chat Service)
  CHAT_SEND_MESSAGE = 'chat.send.message',
  CHAT_GET_CONVERSATIONS = 'chat.get.conversations',
  CHAT_GET_MESSAGES = 'chat.get.messages',
  CHAT_MARK_READ = 'chat.mark.read',
  CHAT_UNREAD_COUNT = 'chat.unread.count',

  // Chat RPC responses (Chat Service -> Gateway)
  CHAT_SEND_MESSAGE_RESPONSE = 'chat.send.message.response',
  CHAT_GET_CONVERSATIONS_RESPONSE = 'chat.get.conversations.response',
  CHAT_GET_MESSAGES_RESPONSE = 'chat.get.messages.response',
  CHAT_MARK_READ_RESPONSE = 'chat.mark.read.response',
  CHAT_UNREAD_COUNT_RESPONSE = 'chat.unread.count.response',

  // WebSocket push events (Services -> API Gateway push queue)
  GATEWAY_PUSH_CHAT_MESSAGE = 'gateway.push.chat.message',
  GATEWAY_PUSH_CHAT_READ = 'gateway.push.chat.read',
  GATEWAY_PUSH_CHAT_CONVERSATION_CREATED = 'gateway.push.chat.conversation_created',
  GATEWAY_PUSH_CHAT_UNREAD_COUNT = 'gateway.push.chat.unread_count',
  GATEWAY_PUSH_NOTIFICATION = 'gateway.push.notification',
  GATEWAY_PUSH_NOTIFICATION_UNREAD_COUNT = 'gateway.push.notification.unread_count',

}
