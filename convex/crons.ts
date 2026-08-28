import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.hourly(
  'permanently delete expired photo trash',
  { minuteUTC: 17 },
  internal.attachments.purgeExpiredTrashedPhotos,
  {},
);

export default crons;
