// Spec F-014's default allocation method per adjustment type:
//   Tax -> proportional, Service charge -> proportional, Tip -> equal,
//   Discount -> proportional, Other -> proportional.
//
// AdjustmentEditorSheet applies this only when the type changes on a *new*
// adjustment, and only while the user hasn't already deliberately picked an
// allocation method themselves — never overriding an already-saved
// adjustment's method just because its type changed while editing. Pulled out
// on its own so that lookup rule is directly unit-testable without rendering
// the sheet.
//
// Redeclared locally rather than imported from db/schema.ts (which already
// redeclares it too) — same intentional decoupling precedent as
// split.types.ts's own copy of these literal unions.
export type AdjustmentType = 'TAX' | 'SERVICE_CHARGE' | 'TIP' | 'DISCOUNT' | 'OTHER';
export type AllocationMethod = 'PROPORTIONAL' | 'EQUAL' | 'CUSTOM';

const DEFAULT_ALLOCATION_METHOD_BY_TYPE: Record<AdjustmentType, AllocationMethod> = {
  TAX: 'PROPORTIONAL',
  SERVICE_CHARGE: 'PROPORTIONAL',
  TIP: 'EQUAL',
  DISCOUNT: 'PROPORTIONAL',
  OTHER: 'PROPORTIONAL',
};

export function defaultAllocationMethodForType(type: AdjustmentType): AllocationMethod {
  return DEFAULT_ALLOCATION_METHOD_BY_TYPE[type];
}
