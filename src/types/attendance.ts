export type AttendanceStatus = 'Hadir' | 'Pulang';

export interface Attendance {
  id: string;
  user_id: string;
  check_in_time: string;
  check_out_time?: string | null;
  status: AttendanceStatus;
  location_check_in?: string;
  location_check_out?: string;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}