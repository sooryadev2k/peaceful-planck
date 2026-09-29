// github-config.js
// GitHub REST API Integration for Clubs Portal

const GITHUB_CONFIG = {
    owner: 'sooryadev2k',         // Your GitHub username / organization
    repo: 'peaceful-planck',      // Your GitHub repository name
    branch: 'master',             // Changed from 'main' to 'master'
    token: localStorage.getItem('gh_token') || ''  // Loads token securely from browser memory
};
// =====================================================
//  Fetch Clubs (Direct from GitHub Raw Content)
// =====================================================
async function fetchClubs() {
    try {
        const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/data/clubs.json?t=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('[GitHub fetchClubs] Fallback to localStorage/demo:', err);
        const local = localStorage.getItem('demo_clubs');
        return local ? JSON.parse(local) : getDemoClubs();
    }
}

function listenToClubs(callback) {
    fetchClubs().then(clubs => callback(clubs));
    return () => { };
}

// =====================================================
//  Verify Admin Passwords (Secure GitHub Token Login)
// =====================================================
async function verifyPassword(password) {
    // If the admin pastes their GitHub Personal Access Token as the password
    if (password.startsWith('ghp_') || password.startsWith('github_pat_')) {
        
        // Test if the token is valid for this repository
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${password}` }
        });
        
        if (res.ok) {
            // Token is valid! Save it in browser memory securely.
            localStorage.setItem('gh_token', password);
            GITHUB_CONFIG.token = password;
            return 'a1'; // Grant Full Admin Access
        }
    }
    
    // If the user logs out, we clear the token
    if (password === 'logout') {
        localStorage.removeItem('gh_token');
        GITHUB_CONFIG.token = '';
    }

    return null; // Invalid token
}

// =====================================================
//  GitHub API File Commit Helpers
// =====================================================
async function getFileSha(path) {
    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}?ref=${GITHUB_CONFIG.branch}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${GITHUB_CONFIG.token}`,
            Accept: 'application/vnd.github.v3+json'
        }
    });
    if (res.status === 200) {
        const data = await res.json();
        return data.sha;
    }
    return null;
}

async function uploadFileToGitHub(path, base64Content, commitMessage) {
    const sha = await getFileSha(path);
    const cleanBase64 = base64Content.replace(/^data:image\/[a-z]+;base64,/, '');

    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;
    const body = {
        message: commitMessage,
        content: cleanBase64,
        branch: GITHUB_CONFIG.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${GITHUB_CONFIG.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to commit to GitHub');
    }

    // Return raw content URL
    return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${path}`;
}

// Convert File object to Base64
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
    const clubId = 'club-' + Date.now();
    const totalSteps = 1 + achievements.filter(a => a.file).length + 1;
    let currentStep = 0;

    const tick = () => {
        currentStep++;
        if (onProgress) onProgress(Math.round((currentStep / totalSteps) * 100));
    };

    // 1. Upload Logo
    let logoUrl = '';
    if (logoFile) {
        const b64 = await fileToBase64(logoFile);
        const ext = logoFile.name.split('.').pop();
        logoUrl = await uploadFileToGitHub(`images/${clubId}-logo.${ext}`, b64, `Upload logo for ${fields.name}`);
    }
    tick();

    // 2. Upload Achievements
    const achData = [];
    for (let i = 0; i < achievements.length; i++) {
        const a = achievements[i];
        let imgUrl = a.existingUrl || '';
        if (a.file) {
            const b64 = await fileToBase64(a.file);
            const ext = a.file.name.split('.').pop();
            imgUrl = await uploadFileToGitHub(`images/${clubId}-ach-${i}.${ext}`, b64, `Upload achievement image for ${fields.name}`);
            tick();
        }
        achData.push({ caption: a.caption || '', imageUrl: imgUrl });
    }

    // 3. Update clubs.json
    const currentClubs = await fetchClubs();
    const newClub = {
        id: clubId,
        name: fields.name,
        clubHead: fields.clubHead,
        mission: fields.mission,
        aboutClub: fields.aboutClub,
        joiningProcedure: fields.joiningProcedure,
        contact: fields.contact,
        logoUrl: logoUrl,
        achievements: achData,
        createdAt: new Date().toISOString()
    };
    currentClubs.unshift(newClub);

    const jsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(currentClubs, null, 2))));
    await uploadFileToGitHub('data/clubs.json', jsonBase64, `Add club: ${fields.name}`);
    tick();

    return clubId;
}

// =====================================================
//  Update Club
// =====================================================
async function updateClub(clubId, fields, newLogoFile, achievements, onProgress) {
    const currentClubs = await fetchClubs();
    const idx = currentClubs.findIndex(c => c.id === clubId);
    if (idx === -1) throw new Error('Club not found');

    let logoUrl = fields.logoUrl || currentClubs[idx].logoUrl || '';
    if (newLogoFile) {
        const b64 = await fileToBase64(newLogoFile);
        const ext = newLogoFile.name.split('.').pop();
        logoUrl = await uploadFileToGitHub(`images/${clubId}-logo.${ext}`, b64, `Update logo for ${fields.name}`);
    }

    const achData = [];
    for (let i = 0; i < achievements.length; i++) {
        const a = achievements[i];
        let imgUrl = a.existingUrl || '';
        if (a.file) {
            const b64 = await fileToBase64(a.file);
            const ext = a.file.name.split('.').pop();
            imgUrl = await uploadFileToGitHub(`images/${clubId}-ach-${i}.${ext}`, b64, `Update achievement for ${fields.name}`);
        }
        achData.push({ caption: a.caption || '', imageUrl: imgUrl });
    }

    currentClubs[idx] = {
        ...currentClubs[idx],
        name: fields.name,
        clubHead: fields.clubHead,
        mission: fields.mission,
        aboutClub: fields.aboutClub,
        joiningProcedure: fields.joiningProcedure,
        contact: fields.contact,
        logoUrl: logoUrl,
        achievements: achData,
        updatedAt: new Date().toISOString()
    };

    const jsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(currentClubs, null, 2))));
    await uploadFileToGitHub('data/clubs.json', jsonBase64, `Update club: ${fields.name}`);
}

// =====================================================
//  Delete Club
// =====================================================
async function deleteClub(clubId) {
    const currentClubs = await fetchClubs();
    const filtered = currentClubs.filter(c => c.id !== clubId);
    const jsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(filtered, null, 2))));
    await uploadFileToGitHub('data/clubs.json', jsonBase64, `Delete club: ${clubId}`);
}

function getDemoClubs() {
    return [
        {
            id: 'demo-1',
            name: 'Amrita Robotics & AI Club',
            clubHead: 'Dr. Rajesh Nair',
            mission: 'To foster innovation and autonomous robotics development.',
            aboutClub: 'The Robotics & AI Club builds drones, rovers, and AI systems.',
            joiningProcedure: 'Open recruitment at the beginning of each semester.',
            contact: 'robotics@amrita.edu | +91 98450 12345',
            logoUrl: '',
            achievements: []
        }
    ];
}