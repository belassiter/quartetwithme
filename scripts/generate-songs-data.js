const fs = require('fs').promises;
const path = require('path');

const assetsDir = path.join(__dirname, '../public/assets');
const outputFilePath = path.join(__dirname, '../public/songs-data.json');

const generateSongMetadata = async (baseName, allFiles) => {
  const instruments = {};

  // Add Main audio if it exists
  const mainAudioPath = `${baseName}_EsQ.mp3`;
  try {
    await fs.access(path.join(assetsDir, mainAudioPath));
    instruments["Main"] = `/assets/${mainAudioPath}`;
  } catch {}

  // Find and add all playalong parts
  const playalongRegex = new RegExp(`^${baseName}_playalong_([a-z0-9]+)\.mp3$`);
  for (const file of allFiles) {
    const match = file.match(playalongRegex);
    if (match && match[1]) {
      const partNameRaw = match[1];
      const formattedPartName = partNameRaw
        .replace(/([a-z])([0-9])/g, '$1 $2')
        .replace(/\b\w/g, l => l.toUpperCase());
      instruments[formattedPartName] = `/assets/${file}`;
    }
  }

  // Check for sheet music, trying different arrangements
  let sheetMusic = null;
  const possibleSheetMusicPaths = [
    `${baseName}_sax_quartet_SATB.mxl`,
    `${baseName}_sax_quartet_AATB.mxl`
  ];

  for (const p of possibleSheetMusicPaths) {
    try {
      await fs.access(path.join(assetsDir, p));
      sheetMusic = `/assets/${p}`;
      break; // Found one, stop looking
    } catch {}
  }

  return {
    id: baseName,
    name: baseName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    mainAudio: instruments["Main"] || null,
    sheetMusic: sheetMusic,
    instruments: instruments
  };
};

async function generateSongsData() {
  try {
    const files = await fs.readdir(assetsDir);
    const songBaseNames = new Set();

    // Discover base names from any relevant file pattern
    files.forEach(file => {
      const matchEsQ = file.match(/(.*)_EsQ\.mp3$/);
      const matchPlayalong = file.match(/(.*)_playalong_.*\.mp3$/);
      const matchMxl = file.match(/(.*)_sax_quartet_(SATB|AATB)\.mxl$/);

      const baseName = (matchEsQ && matchEsQ[1]) || 
                       (matchPlayalong && matchPlayalong[1]) || 
                       (matchMxl && matchMxl[1]);
      
      if (baseName) {
        songBaseNames.add(baseName);
      }
    });

    const songPromises = Array.from(songBaseNames).map(baseName => generateSongMetadata(baseName, files));
    const availableSongs = await Promise.all(songPromises);

    // Filter out songs that don't have at least a main audio track
    const validSongs = availableSongs.filter(song => song.mainAudio);

    await fs.writeFile(outputFilePath, JSON.stringify(validSongs, null, 2));
    console.log(`Generated ${validSongs.length} songs data to ${outputFilePath}`);
  } catch (error) {
    console.error('Error generating songs data:', error);
    process.exit(1); // Exit with error code
  }
}

generateSongsData();
