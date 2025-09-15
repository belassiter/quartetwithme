export interface Song {
  id: string;
  name: string;
  composer?: string;
  genre?: string;
  mainAudio: string | null;
  sheetMusic: string | null;
  instruments: {
    [key: string]: string | undefined;
  };
}
