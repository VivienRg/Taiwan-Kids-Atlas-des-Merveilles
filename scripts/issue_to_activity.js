const fs = require("fs");
const Ajv = require("ajv");

// --- helpers ---
const norm = s => (s||"").toLowerCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g," ").trim();
const keyOf = r => `${norm(r.name)}|${norm(r.city)}`;

function jaroWinkler(a,b){
  a=norm(a); b=norm(b);
  if(!a||!b) return 0;
  const m = Math.floor(Math.max(a.length,b.length)/2)-1;
  let matches=0, transpositions=0;
  const aM=Array(a.length).fill(false), bM=Array(b.length).fill(false);
  for(let i=0;i<a.length;i++){
    const start=Math.max(0,i-m), end=Math.min(i+m+1,b.length);
    for(let j=start;j<end;j++){
      if(bM[j]||a[i]!==b[j]) continue;
      aM[i]=bM[j]=true; matches++; break;
    }
  }
  if(!matches) return 0;
  let k=0;
  for(let i=0;i<a.length;i++) if(aM[i]){
    while(!bM[k]) k++;
    if(a[i]!==b[k]) transpositions++;
    k++;
  }
  const jaro=(matches/a.length + matches/b.length + (matches - transpositions/2)/matches)/3;
  let l=0; for(let i=0;i<Math.min(4,a.length,b.length);i++){ if(a[i]===b[i]) l++; else break; }
  return jaro + l*0.1*(1-jaro);
}

// Issue Form body parsing
function getField(body, label){
  const re = new RegExp(`\\*\\*${label}\\*\\*:?\\s*([\\s\\S]*?)(?:\\n\\*\\*|$)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : "";
}
function parseChecked(body, label){
  const re = new RegExp(`\\*\\*${label}\\*\\*[\\s\\S]*?\\n((?:- \\[[ x]\\] .+\\n?)+)`, "i");
  const m = body.match(re);
  if(!m) return [];
  return m[1].split("\n")
    .map(s=>s.trim()).filter(Boolean)
    .filter(l=>/\[x\]/i.test(l))
    .map(l=>l.replace(/^- \[[ x]\]\s*/i,"").trim());
}

function writeOutput(k,v){
  const out = process.env.GITHUB_OUTPUT;
  if(out) fs.appendFileSync(out, `${k}=${v}\n`);
}

try{
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const issue = event.issue;
  if(!issue || !(issue.labels||[]).some(l=>l.name==="add-activity")){
    console.log("Not an 'add-activity' issue. Exiting.");
    writeOutput("result","ignored");
    process.exit(0);
  }

  const body = issue.body || "";

  // Parse form fields
  const ageMin = parseInt(getField(body, "Minimum Recommended Age"), 10) || 0;
  const ageMax = parseInt(getField(body, "Maximum Recommended Age"), 10) || 14;
  const categories = parseChecked(body, "Categories (select at least one)");
  const features = parseChecked(body, "Features");
  const tags = (getField(body, "Tags (comma separated)") || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const costRange = getField(body, "Cost Range (NTD)");
  
  // Generate URL-friendly ID from name and city
  const name = getField(body, "Activity name");
  const city = getField(body, "City");
  const id = `${norm(name).replace(/\s+/g, '-')}-${norm(city)}`;

  const entry = {
    name,
    region: getField(body, "Region/County"),
    city,
    district: getField(body, "District/Area"),
    indoor_outdoor: getField(body, "Indoor / Outdoor"),
    categories,
    tags,
    cost_range: costRange,
    age_range: [ageMin, ageMax],
    natural: features.some(f => f.toLowerCase().includes("natural")),
    desc: getField(body, "Description"),
    website: getField(body, "Official Website (optional)"),
    map_link: getField(body, "Google Maps Link"),
    drive_min: parseInt(getField(body, "Drive Time (minutes from Zhongli)"), 10) || 0,
    address_en: getField(body, "Full Address (English)"),
    id,
    address_query: getField(body, "Map Search Query")
  };

  // Validate schema
  const schema = JSON.parse(fs.readFileSync("data/activity.schema.json","utf8"));
  const ajv = new Ajv({allErrors:true});
  const validate = ajv.compile(schema);
  if(!validate(entry)){
    console.error(validate.errors);
    writeOutput("result","invalid");
    writeOutput("message", JSON.stringify(validate.errors));
    process.exit(0);
  }

  // Load database
  const filePath = "data/activities_seed.json";
  const db = JSON.parse(fs.readFileSync(filePath,"utf8"));

  // Duplicate checks
  const K = keyOf(entry);
  const byKey = new Map(db.map(r=>[keyOf(r),r]));
  if(byKey.has(K)){
    writeOutput("result","duplicate");
    writeOutput("message", `Exact duplicate of "${byKey.get(K).name}" in ${byKey.get(K).city}.`);
    process.exit(0);
  }
  // Also check same map link (simple exact string)
  if(entry.map_link){
    const sameMap = db.find(r => (r.map_link||"").trim() === entry.map_link.trim());
    if(sameMap){
      writeOutput("result","duplicate");
      writeOutput("message", `Duplicate: same Google Maps link as "${sameMap.name}" in ${sameMap.city}.`);
      process.exit(0);
    }
  }
  // Fuzzy (name+city) to catch slight variations
  const target = `${entry.name} ${entry.city}`;
  const fuzzy = db.filter(r => jaroWinkler(target, `${r.name} ${r.city}`) >= 0.90);
  if(fuzzy.length){
    writeOutput("result","duplicate");
    writeOutput("message", `Possible duplicate(s): ${fuzzy.map(r=>`${r.name} (${r.city})`).join("; ")}`);
    process.exit(0);
  }

  // Append + stable sort
  db.push(entry);
  db.sort((a,b)=>
    (a.city||"").localeCompare(b.city||"") ||
    (a.district||"").localeCompare(b.district||"") ||
    (a.name||"").localeCompare(b.name||"")
  );

  fs.writeFileSync(filePath, JSON.stringify(db,null,2));
  console.log(`Prepared entry: ${entry.name} (${entry.city})`);
  writeOutput("result","created");
  writeOutput("message", `Added ${entry.name} in ${entry.city}.`);

} catch (e){
  console.error(e);
  writeOutput("result","error");
  writeOutput("message", String(e && e.message || e));
  process.exit(0);
}
