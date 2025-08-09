// scripts/fetch_thumbnails.mjs
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure thumbnails directory exists
const thumbsDir = path.resolve(__dirname, '../thumbnails');
if (!fs.existsSync(thumbsDir)) {
  fs.mkdirSync(thumbsDir, { recursive: true });
}

const dataPath = path.resolve(__dirname, '../data/activities.json');
const apiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  console.error('Error: GOOGLE_MAPS_API_KEY environment variable is not set');
  process.exit(1);
}

const activities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Rate limiting to avoid hitting API limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function findPlacePhoto(placeName) {
  try {
    // First, try to find the place ID
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(placeName)}&inputtype=textquery&fields=place_id,name,photos&key=${apiKey}`;
    
    const findRes = await fetch(findUrl);
    const findData = await findRes.json();
    
    if (findData.status !== 'OK' || !findData.candidates?.[0]) {
      console.warn(`No place found for: ${placeName}`);
      return null;
    }
    
    const place = findData.candidates[0];
    
    // If we have photos in the initial response, use the first one
    if (place.photos?.[0]?.photo_reference) {
      return place.photos[0].photo_reference;
    }
    
    // If no photos in initial response, try getting place details
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=photos&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    
    if (detailsData.status === 'OK' && detailsData.result?.photos?.[0]?.photo_reference) {
      return detailsData.result.photos[0].photo_reference;
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding place photo for ${placeName}:`, error.message);
    return null;
  }
}

async function downloadThumbnail(activity) {
  const thumbPath = path.join(thumbsDir, `${activity.id}.png`);
  
  if (fs.existsSync(thumbPath)) {
    console.log(`Thumbnail already exists for: ${activity.name}`);
    return;
  }
  
  console.log(`Processing: ${activity.name}`);
  
  try {
    // Try with the full address query first
    let photoRef = await findPlacePhoto(activity.address_query);
    
    // If no photo found with full address, try with just the name and city
    if (!photoRef) {
      const fallbackQuery = `${activity.name}, ${activity.city}`;
      console.log(`Trying fallback query: ${fallbackQuery}`);
      photoRef = await findPlacePhoto(fallbackQuery);
    }
    
    if (photoRef) {
      const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoRef}&key=${apiKey}`;
      const imgRes = await fetch(photoUrl);
      
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        fs.writeFileSync(thumbPath, Buffer.from(buf));
        console.log(`✅ Downloaded thumbnail for ${activity.name}`);
        await delay(1000); // Rate limiting between downloads
        return;
      }
    }
    
    console.warn(`❌ No photo found for ${activity.name}`);
    
  } catch (error) {
    console.error(`Error downloading thumbnail for ${activity.name}:`, error.message);
  }
}

// Process activities in sequence to avoid rate limiting
async function processActivities() {
  for (const activity of activities) {
    await downloadThumbnail(activity);
  }
  console.log('Thumbnail fetching completed!');
}

processActivities().catch(console.error);
