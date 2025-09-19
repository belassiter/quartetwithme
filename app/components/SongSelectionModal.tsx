'use client';

import { useState } from 'react';
import { Song } from '../interfaces/Song';

interface SongSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSong: (song: Song) => void;
  songs: Song[];
}

export default function SongSelectionModal({ isOpen, onClose, onSelectSong, songs }: SongSelectionModalProps) {
  const [filterText, setFilterText] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleSelect = (song: Song) => {
    onSelectSong(song);
    onClose();
  };

  const filteredSongs = songs.filter(song =>
    song.name.toLowerCase().includes(filterText.toLowerCase()) ||
    (song.composer && song.composer.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Select a Song</h2>
          <button onClick={onClose} className="modal-close-button">&times;</button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            placeholder="Filter songs..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="song-filter-input"
          />
          <ul>
            {filteredSongs.map((song) => (
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
