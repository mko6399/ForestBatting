export interface Checkpoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  mission: string;
  reached: boolean;
  photo?: string;
  answer?: string;
}
