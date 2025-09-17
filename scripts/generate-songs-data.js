const fs = require('fs').promises;
const path = require('path');

const assetsDir = path.join(__dirname, '../public/assets');
const outputFilePath = path.join(__dirname, '../public/songs-data.json');

// Helper to format a base name into a title-like name
const formatName = (baseName) => baseName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

// Helper to discover all unique song base names from the assets directory
const discoverBaseNames = (files) => {
  const songBaseNames = new Set();
  files.forEach(file => {
    const matchEsQ = file.match(/(.*)_EsQ\.mp3$/);
    const matchPlayalong = file.match(/(.*)_playalong_.*\.mp3$/);
    const matchMxl = file.match(/(.*)_sax_quartet_(SATB|AATB)\.mxl$/);
    const baseName = (matchEsQ && matchEsQ[1]) || (matchPlayalong && matchPlayalong[1]) || (matchMxl && matchMxl[1]);
    if (baseName) {
      songBaseNames.add(baseName);
    }
  });
  return Array.from(songBaseNames);
};

// Helper to gather all file paths for a given song base name
const gatherSongFiles = async (baseName, allFiles) => {
  const instruments = {};

  // Main audio
  const mainAudioFile = `${baseName}_EsQ.mp3`;
  if (allFiles.includes(mainAudioFile)) {
    instruments["Main"] = `/assets/${mainAudioFile}`;
  }

  // Playalong parts
  const playalongRegex = new RegExp(`^${baseName}_playalong_([a-z0-9]+)\.mp3$`);
  for (const file of allFiles) {
    const match = file.match(playalongRegex);
    if (match && match[1]) {
      const partNameRaw = match[1];
      const formattedPartName = partNameRaw.replace(/([a-z])([0-9])/g, '$1 $2').replace(/\b\w/g, l => l.toUpperCase());
      instruments[formattedPartName] = `/assets/${file}`;
    }
  }

  // Sheet music
  let sheetMusic = null;
  const possibleSheetMusicPaths = [`${baseName}_sax_quartet_SATB.mxl`, `${baseName}_sax_quartet_AATB.mxl`];
  for (const p of possibleSheetMusicPaths) {
    if (allFiles.includes(p)) {
      sheetMusic = `/assets/${p}`;
      break;
    }
  }

  return {
    mainAudio: instruments["Main"] || null,
    sheetMusic: sheetMusic,
    instruments: instruments
  };
};

async function seedMetadataFiles() {
  console.log('Seeding metadata files...');
  const allFiles = await fs.readdir(assetsDir);
  const songBaseNames = discoverBaseNames(allFiles);

  for (const baseName of songBaseNames) {
    const metadataFilePath = path.join(assetsDir, `${baseName}.json`);
    try {
      await fs.access(metadataFilePath);
    } catch (error) {
      // File does not exist, create a skeleton
      console.log(`  -> Creating skeleton metadata for ${baseName}...`);

      const songFiles = await gatherSongFiles(baseName, allFiles);
      
      const newMetadata = {
        id: baseName,
        name: formatName(baseName),
        composer: "", // To be filled in manually
        arranger: null,
        tempo: null, // To be filled in manually for overrides
        ...songFiles
      };

      await fs.writeFile(metadataFilePath, JSON.stringify(newMetadata, null, 2));
    }
  }
  console.log('Seeding complete.');
}

async function compileSongsData() {
  console.log('Compiling final songs-data.json...');
  const allFiles = await fs.readdir(assetsDir);
  const metadataFiles = allFiles.filter(f => f.endsWith('.json') && f !== path.basename(outputFilePath));

  const allSongs = [];
  for (const metadataFile of metadataFiles) {
    try {
      const filePath = path.join(assetsDir, metadataFile);
      const content = await fs.readFile(filePath, 'utf-8');
      allSongs.push(JSON.parse(content));
    } catch (err) {
      console.error(`Error reading or parsing metadata file ${metadataFile}:`, err);
    }
  }

  allSongs.sort((a, b) => a.name.localeCompare(b.name));

  await fs.writeFile(outputFilePath, JSON.stringify(allSongs, null, 2));
  console.log(`Successfully compiled ${allSongs.length} songs to ${outputFilePath}`);
}

async function main() {
  try {
    await seedMetadataFiles();
    await compileSongsData();
  } catch (error) {
    console.error('An error occurred during the script execution:', error);
    process.exit(1);
  }
}

main();