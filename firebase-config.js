// firebase-config.js
// Firebase initialization and all Firestore / Storage operations

// =====================================================
//  Firebase Initialization
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyCbmgiHoc5Vz28oSSWZIDxt4Yv5NNx4two",
  authDomain: "portal-1feca.firebaseapp.com",
  projectId: "portal-1feca",
  storageBucket: "portal-1feca.firebasestorage.app",
  messagingSenderId: "119844429441",
  appId: "1:119844429441:web:520cfdc0baf3904dd4f780",
  measurementId: "G-M74KJFF162"
};

firebase.initializeApp(firebaseConfig);

const db      = firebase.firestore();
const storage = firebase.storage();

// =====================================================
//  Password Management  (stored in config/passwords)
// =====================================================

/**
 * Fetch stored passwords from Firestore.
 * On first run (doc absent) seeds the doc with defaults.
 * Falls back to hardcoded defaults if Firestore is unreachable.
 */
async function getPasswords() {
  try {
    const ref = db.collection('config').doc('passwords');
    const snap = await ref.get();

    if (snap.exists) {
      return snap.data();                          // { a1: "...", a2: "..." }
    } else {
      // Seed defaults on first run
      const defaults = { a1: 'Admin@1', a2: 'admin2' };
      try { await ref.set(defaults); } catch (_) { /* silent – rules may block */ }
      return defaults;
    }
  } catch (err) {
    console.warn('[Passwords] Firestore unavailable – using defaults:', err.message);
    return { a1: 'Admin@1', a2: 'admin2' };
  }
}

/**
 * Returns 'a1', 'a2', or null depending on the password entered.
 */
async function verifyPassword(password) {
  const pwd = await getPasswords();
  if (password === pwd.a1) return 'a1';
  if (password === pwd.a2) return 'a2';
  return null;
}

// =====================================================
//  Clubs – Real-time Listener
// =====================================================

/**
 * Subscribe to the clubs collection (ordered newest first).
 * Returns the unsubscribe function.
 */
function listenToClubs(callback) {
  return db
    .collection('clubs')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snapshot => {
        const clubs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(clubs);
      },
      err => {
        console.error('[listenToClubs]', err);
        // Try without ordering if index is missing
        db.collection('clubs').onSnapshot(
          snapshot => {
            const clubs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(clubs);
          },
          e2 => console.error('[listenToClubs fallback]', e2)
        );
      }
    );
}

/**
 * Fetch a single club document by id.
 */
async function getClub(id) {
  const snap = await db.collection('clubs').doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// =====================================================
//  Storage Helpers
// =====================================================

/**
 * Upload a File to Firebase Storage and return its public download URL.
 * @param {string}   path            Storage path (e.g. "clubs/abc/logo.png")
 * @param {File}     file            File object from <input type="file">
 * @param {Function} [onProgress]    Called with 0-100 progress value
 */
function uploadFile(path, file, onProgress) {
  const ref  = storage.ref(path);
  const task = ref.put(file);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      err => reject(err),
      async () => {
        const url = await task.snapshot.ref.getDownloadURL();
        resolve(url);
      }
    );
  });
}

/**
 * Delete a file by its download URL (no-op if file not found).
 */
async function deleteStorageFile(url) {
  if (!url) return;
  try {
    await storage.refFromURL(url).delete();
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      console.warn('[deleteStorageFile]', url, err.message);
    }
  }
}

// =====================================================
//  Add Club
// =====================================================

/**
 * Create a new club document with uploaded logo and achievement images.
 *
 * @param {Object}   fields          Text fields (name, clubHead, mission, …)
 * @param {File}     logoFile        Logo image file
 * @param {Array}    achievements    Array of { caption, file }
 * @param {Function} [onProgress]    Progress callback (0-100)
 * @returns {string} New club document id
 */
async function addClub(fields, logoFile, achievements, onProgress) {
  const ref    = db.collection('clubs').doc();   // pre-generate ID
  const clubId = ref.id;

  const totalUploads = 1 + achievements.filter(a => a.file).length;
  let   doneUploads  = 0;

  const tick = () => {
    doneUploads++;
    if (onProgress) onProgress(Math.round((doneUploads / totalUploads) * 100));
  };

  // Upload logo
  const ext    = logoFile.name.split('.').pop().toLowerCase();
  const logoUrl = await uploadFile(`clubs/${clubId}/logo.${ext}`, logoFile, null);
  tick();

  // Upload achievement images
  const achData = [];
  for (let i = 0; i < achievements.length; i++) {
    const a = achievements[i];
    let imageUrl = '';
    if (a.file) {
      const aExt = a.file.name.split('.').pop().toLowerCase();
      imageUrl = await uploadFile(`clubs/${clubId}/achievements/${i}.${aExt}`, a.file, null);
      tick();
    }
    achData.push({ caption: a.caption || '', imageUrl });
  }

  await ref.set({
    ...fields,
    logoUrl,
    achievements: achData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  return clubId;
}

// =====================================================
//  Update Club
// =====================================================

/**
 * Update an existing club.  Only uploads new/replaced files.
 *
 * @param {string}  clubId         Firestore document id
 * @param {Object}  fields         Updated text fields (must include current logoUrl)
 * @param {File|null} newLogoFile  Null = keep existing logo
 * @param {Array}   achievements   Array of { caption, file?, existingUrl? }
 * @param {Function} [onProgress]  Progress callback
 */
async function updateClub(clubId, fields, newLogoFile, achievements, onProgress) {
  const newFiles     = (newLogoFile ? 1 : 0) + achievements.filter(a => a.file).length;
  const totalUploads = Math.max(newFiles, 1);
  let   doneUploads  = 0;

  const tick = () => {
    doneUploads++;
    if (onProgress) onProgress(Math.round((doneUploads / totalUploads) * 100));
  };

  // Handle logo
  let logoUrl = fields.logoUrl || '';
  if (newLogoFile) {
    const ext = newLogoFile.name.split('.').pop().toLowerCase();
    logoUrl = await uploadFile(`clubs/${clubId}/logo_${Date.now()}.${ext}`, newLogoFile, null);
    tick();
  }

  // Handle achievement images
  const achData = [];
  for (let i = 0; i < achievements.length; i++) {
    const a = achievements[i];
    let imageUrl = a.existingUrl || '';
    if (a.file) {
      const aExt = a.file.name.split('.').pop().toLowerCase();
      imageUrl = await uploadFile(
        `clubs/${clubId}/achievements/u${Date.now()}_${i}.${aExt}`,
        a.file,
        null
      );
      tick();
    }
    achData.push({ caption: a.caption || '', imageUrl });
  }

  if (newFiles === 0 && onProgress) onProgress(100);

  const updatePayload = {
    name:              fields.name,
    clubHead:          fields.clubHead,
    mission:           fields.mission,
    aboutClub:         fields.aboutClub,
    joiningProcedure:  fields.joiningProcedure,
    contact:           fields.contact,
    logoUrl,
    achievements:      achData,
    updatedAt:         firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('clubs').doc(clubId).update(updatePayload);
}

// =====================================================
//  Delete Club
// =====================================================

/**
 * Delete a club document and its associated Storage files.
 * @param {string} clubId
 */
async function deleteClub(clubId) {
  // Fetch first to clean up Storage
  const club = await getClub(clubId);

  // Delete Firestore doc
  await db.collection('clubs').doc(clubId).delete();

  // Delete Storage files (best-effort)
  if (club) {
    await deleteStorageFile(club.logoUrl);
    for (const a of (club.achievements || [])) {
      await deleteStorageFile(a.imageUrl);
    }
  }
}
