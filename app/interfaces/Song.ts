export interface Song {
  id: string;
  name: string;
  composer?: string;
  arranger?: string;
  style?: string;
  tempo?: number;
  mainAudio: string | null;
  sheetMusic: string | null;
  instruments: {
    [key: string]: string | undefined;
  };
}