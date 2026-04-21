/**
 * RabbitMQ queue naming conventions
 */
export enum QueueName {
  USER_QUEUE = 'user.queue',
  FREELANCER_PROFILE_QUEUE = 'freelancer.profile.queue',
  CLIENT_PROFILE_QUEUE = 'client.profile.queue',
  JOB_QUEUE = 'job.queue',
  PROPOSAL_QUEUE = 'proposal.queue',
  ESCROW_QUEUE = 'escrow.queue',
  LAUNCHPAD_QUEUE = 'launchpad.queue',
  NOTIFICATION_QUEUE = 'notification.queue',
  CONTRACT_QUEUE = 'contract.queue',
  CHAT_QUEUE = 'chat.queue',
  GATEWAY_QUEUE = 'gateway.push.queue',
}
