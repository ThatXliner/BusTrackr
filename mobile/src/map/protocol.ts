import {z} from 'zod';
import type {EstimatedPrediction} from '../shuttle/feed';

const markerSchema = z.object({
  direction: z.enum(['inbound', 'outbound']),
  progress: z.number().min(0).max(1),
  lower: z.number().min(0).max(1),
  upper: z.number().min(0).max(1),
}).refine(marker => marker.lower <= marker.progress && marker.progress <= marker.upper);
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('state'), marker: markerSchema.nullable(), expiresAt: z.number().finite(), active: z.boolean()}),
  z.object({kind: z.literal('camera'), view: z.enum(['campus', 'route', 'fehren', 'buildings', 'sports', 'estimate'])}),
  z.object({kind: z.literal('orbit'), enabled: z.boolean()}),
  z.object({kind: z.literal('zoom'), factor: z.union([z.literal(.75), z.literal(1.25)])}),
]);
export type SceneCommand = z.infer<typeof commandSchema>;
export const sceneEventSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('ready')}),
  z.object({kind: z.literal('error'), message: z.string()}),
]);
export function markerIsCurrent(command: Extract<SceneCommand, {kind: 'state'}>, now: number): boolean {
  return command.active && command.marker !== null && command.expiresAt > now && command.expiresAt <= now + 45_000;
}

export function sceneState(prediction: EstimatedPrediction | null, checkedAt: string | null, active: boolean, now: number): Extract<SceneCommand, {kind: 'state'}> {
  const expiresAt = prediction && checkedAt ? Math.min(
    now + 45_000, Date.parse(prediction.generatedAt) + 45_000,
    Date.parse(checkedAt) + 120_000, Date.parse(prediction.estimatedArrivalAt),
  ) : 0;
  return {kind: 'state', marker: prediction?.marker ?? null, expiresAt, active};
}
