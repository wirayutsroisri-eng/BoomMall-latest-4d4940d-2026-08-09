export type VaultItemKind = 'note' | 'receipt' | 'photo' | 'vehicle' | 'hidden-chat' | 'diagram';

export type VaultItem = {
  id: string;
  kind: VaultItemKind;
  title: string;
  subtitle: string;
  updatedAt: string;
  /** Links back to the source (e.g. feed post id) so it can be un-saved */
  refId?: string;
  imageUri?: string;
};

export type VehicleRecord = {
  id: string;
  model: string;
  plate: string;
  batterySpec: string;
  lastService: string;
  notes: string;
};
