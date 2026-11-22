// Language / taste helpers for song suggestions. Queue suggestions were mixing English songs into
// Hindi/Punjabi queues, so we tell Indian songs from Western ones and keep suggestions in the
// listener's language.

const INDIAN_ARTISTS = [
  'arijit singh','atif aslam','shreya ghoshal','neha kakkar','badshah','honey singh','yo yo honey singh','diljit dosanjh',
  'ap dhillon','sidhu moose wala','karan aujla','jubin nautiyal','darshan raval','sonu nigam','kumar sanu','udit narayan',
  'alka yagnik','lata mangeshkar','kishore kumar','mohammed rafi','mohit chauhan','kk','vishal mishra','b praak','guru randhawa',
  'armaan malik','pritam','a r rahman','a.r. rahman','anuv jain','sunidhi chauhan','asees kaur','tulsi kumar','mika singh',
  'yasser desai','raghav chaitanya','dhvani bhanushali','pawan singh','khesari lal','sachin-jigar','sachin jigar','amit trivedi',
  'vishal-shekhar','shankar mahadevan','papon','palak muchhal','payal dev','stebin ben','ammy virk','gippy grewal','jass manak',
  'harrdy sandhu','amrit maan','kaka','jaani','mankirt aulakh','sunanda sharma','gurnam bhullar','shubh','imran khan','ikka',
  'raftaar','emiway','divine','king','mc stan','seedhe maut','talwiinder','prateek kuhad','arjun kanungo','ankit tiwari',
  'mithoon','sukhwinder singh','hariharan','abhijeet','kailash kher','rahat fateh ali khan','nusrat fateh ali khan','ali sethi',
  'jasleen royal','zahrah s khan','rochak kohli','tanishk bagchi','vishal dadlani','nikhita gandhi','aastha gill','kanika kapoor',
  'neeti mohan','shilpa rao','sanam','farhan akhtar','piyush chowdhury','piyush chaudhary','guru randhawa','bohemia','nucleya',
  'g khan','sukh-e','harshdeep kaur','sonu kakkar','monali thakur','sona mohapatra','ash king','benny dayal','anirudh ravichander',
  'dhanush','sid sriram','yuvan shankar raja','devi sri prasad','thaman','sp balasubramanyam','s p balasubrahmanyam','chinmayi',
  'kumar sanu','abhijeet bhattacharya','mukesh','manna dey','asha bhosle','hemant kumar','talat mahmood','geeta dutt','shamshad begum',
  'sukhbir','daler mehndi','jazzy b','malkit singh','babbu maan','gurdas maan','satinder sartaaj','karan sehmbi','nimrat khaira',
  'afsana khan','sapna choudhary','renuka panwar','masoom sharma','ajay hooda','diler kharkiya'
];
const INDIAN_CHANNELS = [
  't-series','t series','zee music','sony music india','tips official','tips music','saregama','speed records','times music',
  'eros now','yash raj films','yrf','lahari music','desi melodies','think music','aditya music','tseries','venus','shemaroo',
  'gaana','jiosaavn','white hill music','geet mp3','rdc','ultra','vevo india','junglee music','muzik247','pitaara','hungama',
  'music label','bollywood','filmigaane','tips films','nupur audio','vyrl','playdmf','dhamaka','sa re ga ma'
];
const INDIAN_WORDS = /\b(hindi|punjabi|bollywood|bhojpuri|haryanvi|tamil|telugu|marathi|gujarati|bengali|kannada|malayalam|desi|filmy|ghazal|qawwali|sufi|dj remix hindi|hit songs hindi|arijit|lofi hindi|jukebox)\b/i;
const INDIC_SCRIPT = /[ऀ-ॿ਀-੿ঀ-৿஀-௿ఀ-౿઀-૿]/;
const HINDI_TITLE = /\b(tera|mera|meri|teri|tum|tumse|hum|dil|pyar|pyaar|ishq|ishk|mohabbat|zindagi|saath|sanam|sajna|sajan|jaan|ki|ke|ka|ko|se|hai|hain|ho|nahi|nahin|kyun|kyu|aaj|raat|baatein|yaar|yaad|khwab|khwabo|bewafa|bekhayali|kesariya|tujhe|mujhe|humsafar|zara|bas|ek|dekha|chaand|aankhein|rangrez|mahiya|soniye|kudi|munda|jatt|gabru|teri|laadki|ladki|dilbar|dhadkan)\b/i;
const WESTERN_ARTISTS = [
  'ed sheeran','taylor swift','justin bieber','the weeknd','weeknd','dua lipa','billie eilish','imagine dragons','coldplay','eminem',
  'drake','post malone','bruno mars','adele','rihanna','ariana grande','selena gomez','charlie puth','shawn mendes','maroon 5',
  'linkin park','marshmello','alan walker','martin garrix','kygo','avicii','calvin harris','david guetta','onerepublic','sia',
  'katy perry','lady gaga','miley cyrus','harry styles','olivia rodrigo','sam smith','lewis capaldi','travis scott','kendrick lamar',
  '21 savage','bts','blackpink','camila cabello','ellie goulding','rema','doja cat','sza','lana del rey','queen','the beatles',
  'michael jackson','nf','juice wrld','xxxtentacion','lil nas x','lil baby','lil wayne','pitbull','jason derulo','sean paul','akon',
  'one direction','5 seconds of summer','halsey','the chainsmokers','zedd','tones and i','glass animals','gotye','kodak black',
  'khalid','jvke','benson boone','sabrina carpenter','chappell roan','teddy swims','morgan wallen','luke combs','tyla','burna boy',
  'wizkid','ava max','meghan trainor','pink floyd','metallica','nirvana','guns n roses','ac/dc','bon jovi','eagles','abba'
];

const norm = s => String(s || '').toLowerCase().replace(/\s*-\s*topic$/, '').replace(/[^\p{L}\p{N}\s.\-]/gu, ' ').replace(/\s+/g, ' ').trim();
const hasName = (hay, list) => list.some(n => hay.includes(n.length <= 3 ? ` ${n} ` : n));

// 'in' (Indian), 'en' (Western) or '' (can't tell)
export function songLanguage(title, artist) {
  const t = ` ${norm(title)} `;
  const a = ` ${norm(artist)} `;
  const both = t + a;
  if (INDIC_SCRIPT.test(`${title} ${artist}`)) return 'in';
  if (hasName(a, INDIAN_ARTISTS) || hasName(t, INDIAN_ARTISTS) || hasName(a, INDIAN_CHANNELS)) return 'in';
  if (INDIAN_WORDS.test(both)) return 'in';
  if (hasName(a, WESTERN_ARTISTS) || hasName(t, WESTERN_ARTISTS) || /vevo\s*$/.test(a.trim())) return 'en';
  if (HINDI_TITLE.test(t)) return 'in';
  return '';
}

// recent: [{name|title, artist}] -> share of songs that are Indian, 0..1 (only counted when language is known)
export function indianShare(recent) {
  let known = 0, ind = 0;
  for (const s of recent || []) {
    const l = songLanguage(s.name || s.title, s.artist);
    if (!l) continue;
    known++;
    if (l === 'in') ind++;
  }
  return known ? ind / known : 0;
}

// Does the listener want Indian songs right now?
export function prefersIndian(seed, recent) {
  // User strict requirement: suggestions and play queue must default to Indian (Hindi/Punjabi)
  const l = songLanguage(seed?.title || '', seed?.artist || '');
  if (l === 'en') return false;
  return true;
}

// Keep songs that fit the language: Indian songs first, unknown ones after, Western ones dropped.
export function keepIndian(list) {
  const ind = [];
  for (const v of list) {
    const l = songLanguage(v.title || v.name || '', v.artist || '');
    if (l === 'in') {
      ind.push(v);
    } else if (l !== 'en') {
      // If unknown, ensure no obvious English words before allowing
      const t = String(v.title || v.name || '').toLowerCase();
      const a = String(v.artist || '').toLowerCase();
      if (!/\b(vevo|feat\.|ft\.|summer|lyrics|official audio|acoustic)\b/i.test(a) &&
          !/\b(remix english|english version|pop hits|billboard)\b/i.test(t)) {
        ind.push(v);
      }
    }
  }
  return ind;
}

// Popular Indian singers: used for the default "trending" search.
export const TRENDING_ARTISTS = [
  'Karan Aujla', 'Sidhu Moose Wala', 'Diljit Dosanjh', 'AP Dhillon', 'Arijit Singh', 'Shubh', 'Badshah', 'Yo Yo Honey Singh', 'King', 'Anuv Jain', 'Shreya Ghoshal', 'Atif Aslam',
  'Badshah', 'Yo Yo Honey Singh', 'Neha Kakkar', 'Jubin Nautiyal', 'Sonu Nigam', 'Guru Randhawa', 'B Praak',
  'Darshan Raval', 'Armaan Malik', 'Vishal Mishra', 'Kumar Sanu', 'Udit Narayan', 'Kishore Kumar', 'Lata Mangeshkar',
  'Mohammed Rafi', 'A R Rahman', 'Sunidhi Chauhan', 'Anuv Jain', 'Mohit Chauhan', 'KK', 'Alka Yagnik', 'Mika Singh', 'Jass Manak'
];

// ── Mood: keep love songs with love songs, and rowdy/party songs with their own kind ──
const ROWDY_ARTISTS = /(karan aujla|sidhu moose|moose wala|shubh|ap dhillon|prem dhillon|amrit maan|jordan sandhu|wazir patar|badshah|honey singh|yo yo|mc stan|divine|raftaar|seedhe maut|emiway|kr\$na|king\b|masoom sharma|ajay hooda|diler kharkiya|khasa aala|gulzaar|sapna choudhary|renuka panwar|mika singh|sukh-e|bohemia|ikka|g khan)/i;
const ROWDY_WORDS = /\b(badmash|badmashi|badmaash|gangster|gangsta|gang\b|jatt|jatti|gabru|bandook|pistol|shooter|daaru|sharab|peg\b|club|party|dj\b|dance|item|desi hip ?hop|rap\b|drill|haryanvi|bhojpuri|attitude|swag|baap|dhamaka|thumka|chhori|laundiya|nashe|nasha|bass boosted|mashup|remix)\b/i;
const ROMANTIC_ARTISTS = /(arijit singh|atif aslam|jubin nautiyal|vishal mishra|mithoon|pritam|\bkk\b|shreya ghoshal|armaan malik|darshan raval|anuv jain|mohit chauhan|kumar sanu|udit narayan|alka yagnik|jasleen royal|b praak|palak muchhal|rahat fateh|sonu nigam|yasser desai|asees kaur|prateek kuhad|payal dev)/i;
const ROMANTIC_WORDS = /\b(pyaar|pyar|ishq|ishk|mohabbat|muhabbat|love|dil\b|sanam|sajna|sajan|humsafar|tum hi|tum ho|tujhe|tere liye|tera ban|tera hone|kesariya|saiyaara|rangrez|raabta|khwab|khwabo|bekhayali|hawa banke|dhadkan|aashiqui|mahiya|soniye|ve kamleya|channa mereya|hum jee lenge|judaai|bewafa|tanha|yaad|intezaar|romantic)\b/i;

// 'rowdy' | 'romantic' | '' (unknown)
export function songMood(title, artist) {
  const text = `${title || ''} ${artist || ''}`;
  if (ROWDY_WORDS.test(text) || ROWDY_ARTISTS.test(text)) return 'rowdy';
  if (ROMANTIC_WORDS.test(text) || ROMANTIC_ARTISTS.test(text)) return 'romantic';
  return '';
}

// A love-song seed must not get rowdy/party songs; a rowdy seed keeps its own kind.
export function fitMood(seedMood, list) {
  if (seedMood === 'romantic') return list.filter(v => songMood(v.title, v.artist) !== 'rowdy');
  if (seedMood === 'rowdy') return list.filter(v => songMood(v.title, v.artist) !== 'romantic');
  return list;
}

// No more than `max` songs by the same singer in a row of suggestions (variety).
export function limitPerArtist(list, max = 2) {
  const count = {};
  return list.filter(v => {
    const a = String(v.artist || '').toLowerCase().split(/[,&]/)[0].trim() || v.videoId;
    count[a] = (count[a] || 0) + 1;
    return count[a] <= max;
  });
}

export const ROMANTIC_TOP = ['Arijit Singh', 'Atif Aslam', 'Jubin Nautiyal', 'Vishal Mishra', 'Shreya Ghoshal', 'Armaan Malik', 'Darshan Raval', 'Anuv Jain', 'Mithoon', 'Pritam'];
