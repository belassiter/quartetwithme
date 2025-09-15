'use client';

import { Song } from '../interfaces/Song';

interface SongSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: Song) => void;
  songs: Song[];
}

export default function SongSelectionModal({ isOpen, onClose, onSelectSong, songs }: SongSelectionModalProps) {
  if (!isOpen) {
    return null;
  }

  const handleSelect = (song: Song) => {
    onSelectSong(song);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Select a Song</h2>
          <button onClick={onClose} className="modal-close-button">&times;</button>
        </div>
        <div className="modal-body">
          <ul>
            {songs.map((song) => (
              <li key={song.id} onClick={() => handleSelect(song)} className="song-item">
                <h3>{song.name}</h3>
                {song.composer && <p>{song.composer}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}