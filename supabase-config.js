// supabase-config.js
// Supabase initialization, Database (PostgreSQL) operations, and Storage helpers

// =====================================================
//  Supabase Credentials
//  Replace these with your Supabase Project URL & Anon Key
//  Found in: Project Settings -> API
// =====================================================
const SUPABASE_URL = 'https://ipbnzgawnwijqvtlnjqp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYm56Z2F3bndpanF2dGxuanFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODc2MTMsImV4cCI6MjEwNjI2MzYxM30.XETh4uqeAOn2cNJHsYY-1RJvUw1-XGFxbn5IQS_kfEw';

// Initialize Supabase Client
const supabase = (typeof window.supabase !== 'undefined' && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// =====================================================
//  Password Management (stored in 'config' table or defaults)
// =====================================================
async function getPasswords() {
  try {
    if (!supabase || SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
      return { a1: 'Admin@1', a2: 'admin2' };
    }

    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'passwords')
      .maybeSingle();

    if (error) {
      console.warn('[Passwords] Using fallback defaults:', error.message);
      return { a1: 'Admin@1', a2: 'admin2' };
    }

    if (data && data.value) {
      return data.value; // { a1: "Admin@1", a2: "admin2" }
    } else {
      // Seed default passwords into config table
      const defaults = { a1: 'Admin@1', a2: 'admin2' };
      await supabase.from('config').upsert({ key: 'passwords', value: defaults });
      return defaults;
    }
  } catch (err) {
    console.warn('[Passwords] Error fetching passwords:', err.message);
    return { a1: 'Admin@1', a2: 'admin2' };
  }
}

async function verifyPassword(password) {
  const pwd = await getPasswords();
  if (password === pwd.a1) return 'a1';
  if (password === pwd.a2) return 'a2';
  return null;
}

// =====================================================
//  Clubs – Fetch & Real-time Subscription
// =====================================================

/**
 * Fetch all clubs ordered by creation date (newest first).
 */
async function fetchClubs() {
  if (!supabase || SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    // Return sample local demo clubs if Supabase is not yet configured
    const local = localStorage.getItem('demo_clubs');
    return local ? JSON.parse(local) : getDemoClubs();
  }

  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchClubs] Error:', error);
    throw error;
  }

  // Normalize field names to match camelCase in app.js
  return (data || []).map(normalizeClubData);
}

/**
 * Real-time listener for changes in the 'clubs' table.
 */
function listenToClubs(callback) {
  // Initial load
  fetchClubs().then(clubs => callback(clubs)).catch(err => {
    console.warn('[listenToClubs] Initial fetch failed, using fallback:', err.message);
    callback(getDemoClubs());
  });

  if (!supabase || SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    return () => { };
  }

  const channel = supabase
    .channel('public:clubs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clubs' }, async () => {
      try {
        const clubs = await fetchClubs();
        callback(clubs);
      } catch (err) {
        console.error('[Realtime change error]:', err);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

function normalizeClubData(row) {
  return {
    id: row.id,
    name: row.name,
    clubHead: row.club_head,
    mission: row.mission,
    aboutClub: row.about_club,
    joiningProcedure: row.joining_procedure,
    contact: row.contact,
    logoUrl: row.logo_url,
    achievements: row.achievements || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// =====================================================
//  Supabase Storage Helpers
// =====================================================

/**
 * Upload a file to Supabase Storage 'club-assets' bucket.
 */
async function uploadStorageFile(filePath, file) {
  if (!supabase || SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    // Return base64 preview for demo offline mode
    return await fileToBase64(file);
  }

  const { data, error } = await supabase.storage
    .from('club-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    console.error('[Supabase Storage Upload Error]:', error);
    throw error;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('club-assets')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// =====================================================
//  Add Club
// =====================================================
async function addClub(fields, logoFile, achievements, onProgress) {
  const clubId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'club_' + Date.now();

  const totalSteps = 1 + achievements.filter(a => a.file).length + 1;
  let currentStep = 0;

  const updateProgress = () => {
    currentStep++;
    if (onProgress) onProgress(Math.round((currentStep / totalSteps) * 100));
  };

  // 1. Upload Logo
  let logoUrl = '';
  if (logoFile) {
    const fileExt = logoFile.name.split('.').pop();
    const filePath = `logos/${clubId}.${fileExt}`;
    logoUrl = await uploadStorageFile(filePath, logoFile);
  }
  updateProgress();

  // 2. Upload Achievements
  const achData = [];
  for (let i = 0; i < achievements.length; i++) {
    const a = achievements[i];
    let imageUrl = '';
    if (a.file) {
      const aExt = a.file.name.split('.').pop();
      const aPath = `achievements/${clubId}_${i}_${Date.now()}.${aExt}`;
      imageUrl = await uploadStorageFile(aPath, a.file);
      updateProgress();
    } else if (a.existingUrl) {
      imageUrl = a.existingUrl;
    }
    achData.push({
      caption: a.caption || '',
      imageUrl: imageUrl
    });
  }

  // 3. Insert into Supabase 'clubs' table
  if (supabase && !SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    const { error } = await supabase.from('clubs').insert({
      id: clubId,
      name: fields.name,
      club_head: fields.clubHead,
      mission: fields.mission,
      about_club: fields.aboutClub,
      joining_procedure: fields.joiningProcedure,
      contact: fields.contact,
      logo_url: logoUrl,
      achievements: achData
    });

    if (error) throw error;
  } else {
    // Fallback Local Storage Mode
    const current = JSON.parse(localStorage.getItem('demo_clubs') || '[]');
    const newClub = {
      id: clubId,
      ...fields,
      logoUrl,
      achievements: achData,
      createdAt: new Date().toISOString()
    };
    current.unshift(newClub);
    localStorage.setItem('demo_clubs', JSON.stringify(current));
  }

  updateProgress();
  return clubId;
}

// =====================================================
//  Update Club
// =====================================================
async function updateClub(clubId, fields, newLogoFile, achievements, onProgress) {
  const totalSteps = (newLogoFile ? 1 : 0) + achievements.filter(a => a.file).length + 1;
  let currentStep = 0;

  const updateProgress = () => {
    currentStep++;
    if (onProgress) onProgress(Math.round((currentStep / totalSteps) * 100));
  };

  // 1. Handle Logo
  let logoUrl = fields.logoUrl || '';
  if (newLogoFile) {
    const fileExt = newLogoFile.name.split('.').pop();
    const filePath = `logos/${clubId}_${Date.now()}.${fileExt}`;
    logoUrl = await uploadStorageFile(filePath, newLogoFile);
    updateProgress();
  }

  // 2. Handle Achievements
  const achData = [];
  for (let i = 0; i < achievements.length; i++) {
    const a = achievements[i];
    let imageUrl = a.existingUrl || '';
    if (a.file) {
      const aExt = a.file.name.split('.').pop();
      const aPath = `achievements/${clubId}_${i}_${Date.now()}.${aExt}`;
      imageUrl = await uploadStorageFile(aPath, a.file);
      updateProgress();
    }
    achData.push({
      caption: a.caption || '',
      imageUrl: imageUrl
    });
  }

  // 3. Update Database
  if (supabase && !SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    const { error } = await supabase
      .from('clubs')
      .update({
        name: fields.name,
        club_head: fields.clubHead,
        mission: fields.mission,
        about_club: fields.aboutClub,
        joining_procedure: fields.joiningProcedure,
        contact: fields.contact,
        logo_url: logoUrl,
        achievements: achData,
        updated_at: new Date().toISOString()
      })
      .eq('id', clubId);

    if (error) throw error;
  } else {
    // Local storage fallback
    const current = JSON.parse(localStorage.getItem('demo_clubs') || '[]');
    const idx = current.findIndex(c => c.id === clubId);
    if (idx !== -1) {
      current[idx] = {
        ...current[idx],
        ...fields,
        logoUrl,
        achievements: achData,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('demo_clubs', JSON.stringify(current));
    }
  }

  updateProgress();
}

// =====================================================
//  Delete Club
// =====================================================
async function deleteClub(clubId) {
  if (supabase && !SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    const { error } = await supabase
      .from('clubs')
      .delete()
      .eq('id', clubId);

    if (error) throw error;
  } else {
    // Local storage fallback
    const current = JSON.parse(localStorage.getItem('demo_clubs') || '[]');
    const filtered = current.filter(c => c.id !== clubId);
    localStorage.setItem('demo_clubs', JSON.stringify(filtered));
  }
}

// =====================================================
//  Demo Clubs Placeholder Data
// =====================================================
function getDemoClubs() {
  return [
    {
      id: 'demo-1',
      name: 'Amrita Robotics & AI Club',
      clubHead: 'Dr. Rajesh Nair',
      mission: 'To foster innovation, hands-on robotics development, and intelligent autonomous systems among students.',
      aboutClub: 'The Robotics and AI club is one of the oldest technical clubs on campus. We participate in international hackathons, building autonomous drones, rovers, and cutting-edge machine learning projects.',
      joiningProcedure: 'Open recruitment drives are held at the beginning of each semester followed by a short technical interaction.',
      contact: 'robotics@amrita.edu | +91 98450 12345 | Instagram: @amrita_robotics',
      logoUrl: '',
      achievements: [
        { caption: '1st Place in National RoboWars 2024', imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&auto=format&fit=crop&q=80' },
        { caption: 'Autonomous Agricultural Drone Prototype', imageUrl: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=600&auto=format&fit=crop&q=80' }
      ]
    },
    {
      id: 'demo-2',
      name: 'ACM Student Chapter',
      clubHead: 'Prof. Sandhya Menon',
      mission: 'Promoting computing as a science and a profession through workshops, competitive programming, and technical talks.',
      aboutClub: 'ACM Amrita is a dynamic student community focused on algorithmic problem solving, open-source software, and distributed computing.',
      joiningProcedure: 'Register via the membership portal at the start of the academic year.',
      contact: 'acm@amrita.edu | LinkedIn: acm-amrita',
      logoUrl: '',
      achievements: [
        { caption: 'Organized Annual 36-Hour Hackathon with 500+ participants', imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&auto=format&fit=crop&q=80' }
      ]
    }
  ];
}
