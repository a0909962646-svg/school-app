export type ActiveView = 'draw' | 'group' | 'roster';

export interface Student {
  id: string;
  seatNo: number;
  name: string;
  active: boolean; // false when student is marked absent for the day
}

export interface DrawRecord {
  id: string;
  round: number;
  studentId: string;
  studentName: string;
  seatNo: number;
  timestamp: string;
}

export type RemainderStrategy = 'balanced' | 'separate';

export interface StudentGroup {
  id: string;
  index: number;
  name: string;
  colorIndex: number;
  leaderId: string | null;
  members: Student[];
}

export interface ParsedCsvPreview {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  detectedNameCol: number;
  fileName: string;
}
