import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingSpinner: React.FC<{ label?: string }> = () => {
  return null;
};

export const Skeleton: React.FC<SkeletonProps> = () => {
  return null;
};

export const MetricCardSkeleton: React.FC<{ className?: string }> = () => {
  return null;
};

export const MetricGridSkeleton: React.FC<{ count?: number; columns?: string }> = () => {
  return null;
};

export const TableRowSkeleton: React.FC<{ columnsCount?: number }> = () => {
  return null;
};

export const TableSkeleton: React.FC<{ rows?: number; showHeaderControls?: boolean }> = () => {
  return null;
};

export const PermitStatusSummarySkeleton: React.FC = () => {
  return null;
};
