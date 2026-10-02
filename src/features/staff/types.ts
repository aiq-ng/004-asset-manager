export interface StaffListOption {
  id: string;
  name: string;
  department: string;
  email: string;
  role: "USER" | "ASSIGNER" | "ADMIN" | "SUPERADMIN";
}

export interface AssignmentListItem {
  id: string;
  dateAssigned: string;
  dateReturned: string | null;
  note: string | null;
  active: boolean;
  asset: {
    id: string;
    assetId: string;
    description: string;
    status: string;
  };
  staff: StaffListOption;
}

export interface StaffListItem extends StaffListOption {
  phone: string | null;
}