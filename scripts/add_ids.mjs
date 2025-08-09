// scripts/add_ids.mjs
import fs from 'fs';
import path from 'path';
import slugify from 'slugify';

const dataPath = path.resolve('data/activities.json');
const activities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

activities.forEach(a => {
  if (!a.id) {
    a.id = slugify(a.name, { lower: true, strict: true });
  }
});

fs.writeFileSync(dataPath, JSON.stringify(activities, null, 2));
console.log('IDs added where missing.');
