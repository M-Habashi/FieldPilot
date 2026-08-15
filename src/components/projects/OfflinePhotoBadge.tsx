import { CircleAlert, CloudOff, CloudUpload, LoaderCircle } from 'lucide-react';
import { ActionBarBadge, ActionBarButton } from '../ui/action-bar';
import { cn } from '../../lib/utils';

interface OfflinePhotoBadgeProps {
  pendingCount: number;
  uploadingCount: number;
  failedCount: number;
  isOnline: boolean;
  onRetry: () => void;
}

export function OfflinePhotoBadge({
  pendingCount,
  uploadingCount,
  failedCount,
  isOnline,
  onRetry,
}: OfflinePhotoBadgeProps) {
  const totalCount = pendingCount + uploadingCount + failedCount;
  if (totalCount === 0) return null;

  const needsRetry = failedCount > 0;
  const isUploading = uploadingCount > 0;
  const label = needsRetry
    ? 'Retry photo uploads'
    : isUploading
      ? 'Uploading photos'
      : isOnline
        ? 'Sync queued photos'
        : 'Photos waiting for connection';
  const title = needsRetry
    ? `${failedCount} photo ${failedCount === 1 ? 'upload needs' : 'uploads need'} attention. Retry.`
    : isUploading
      ? `${uploadingCount} ${uploadingCount === 1 ? 'photo is' : 'photos are'} uploading.`
      : isOnline
        ? `${pendingCount} ${pendingCount === 1 ? 'photo is' : 'photos are'} ready to upload.`
        : `${pendingCount} ${pendingCount === 1 ? 'photo is' : 'photos are'} saved on this device.`;
  const icon = needsRetry ? (
    <CircleAlert />
  ) : isUploading ? (
    <LoaderCircle className="animate-spin" />
  ) : isOnline ? (
    <CloudUpload />
  ) : (
    <CloudOff />
  );

  return (
    <span aria-live="polite">
      <ActionBarButton
        icon={icon}
        label={label}
        labelFrom="lg"
        title={title}
        onClick={onRetry}
        disabled={isUploading && !needsRetry}
        className={cn(needsRetry && 'text-danger hover:text-danger', !isOnline && 'text-warn')}
      >
        <ActionBarBadge>{totalCount}</ActionBarBadge>
      </ActionBarButton>
    </span>
  );
}
