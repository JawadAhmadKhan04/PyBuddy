/*npm init -y
npm install googleapis
npm install open
npm install luxon
npm install base-64*/
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const base64 = require('base-64');
const open = require('open').default;  
const { URL } = require('url');
const { DateTime } = require('luxon');

const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/classroom.coursework.me'
];

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

async function loadSavedCredentials() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = JSON.parse(fs.readFileSync(CREDENTIALS_PATH)).installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }
  return null;
}

async function saveCredentials(client) {
  const content = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const key = content.installed || content.web;
  const payload = {
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(payload));
}

async function authorize() {
  let client = await loadSavedCredentials();
  if (client) {
    console.log('✅ Token loaded.');
    return client;
  }

  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);
  await open(authUrl);

  const code = await question('Enter the code from that page here: ');
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  await saveCredentials(client);
  console.log('✅ Login successful.');

  return client;
}

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => {
    rl.close();
    resolve(ans);
  }));
}

function extractCourseIdFromUrl(classroomUrl) {
  try {
    const url = new URL(classroomUrl);
    const match = url.pathname.match(/\/c\/([a-zA-Z0-9]+)/);
    if (!match) throw new Error();
    const encoded = match[1];
    try {
      const decoded = base64.decode(encoded);
      if (/^\d+$/.test(decoded)) return decoded;
    } catch (_) {}
    return encoded;
  } catch (err) {
    throw new Error('Invalid Google Classroom URL. Course ID not found.');
  }
}

async function getCourses(classroom) {
  const res = await classroom.courses.list({ pageSize: 10 });
  const courses = res.data.courses || [];
  if (!courses.length) {
    console.log('📭 No courses found.');
  } else {
    console.log('🗂️ Your Courses:');
    courses.forEach(c => console.log(`• ${c.name} (${c.id})`));
  }
  return courses;
}

async function getAssignments(classroom, courseId) {
  const res = await classroom.courses.courseWork.list({ courseId });
  const list = res.data.courseWork || [];
  if (!list.length) {
    console.log(`📭 No assignments found for course ID ${courseId}`);
  } else {
    console.log(`📚 Assignments in course ${courseId}:`);
    list.forEach(a => console.log(`- ${a.title} (ID: ${a.id})`));
  }
  return list;
}

async function getAssignmentDetails(classroom, courseId, assignmentId) {
  const res = await classroom.courses.courseWork.get({ courseId, id: assignmentId });
  const a = res.data;
  console.log('📄 Assignment Details:');
  console.log(`Title       : ${a.title}`);
  console.log(`Description : ${a.description || '—'}`);

  if (a.dueDate) {
    const { year, month, day } = a.dueDate;
    const { hours = 0, minutes = 0 } = a.dueTime || {};
    const dt = DateTime.fromObject({ year, month, day, hour: hours, minute: minutes, zone: 'UTC' })
      .setZone('Asia/Karachi');
    console.log(`Due Date/Time: ${dt.toFormat('yyyy-MM-dd HH:mm')}`);
  } else {
    console.log('Due Date/Time: No due date set');
  }

  console.log(`Max Points  : ${a.maxPoints || '—'}`);
  return a;
}

async function joinCourse(classroom, classroomUrl, courseId) {
  const id = classroomUrl ? extractCourseIdFromUrl(classroomUrl) : courseId;
  console.log(`✅ Joining course with ID: ${id}`);
  try {
    await classroom.courses.students.create({ courseId: id, requestBody: { userId: 'me' } });
    console.log(`✅ Successfully joined course ${id}`);
  } catch (err) {
    console.error('❌ Failed to join course:', err.message);
  }
}

function logout() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
    console.log('✅ Logged out and token removed.');
  } else {
    console.log('No token file to delete.');
  }
}

(async () => {
  const auth = await authorize();
  const classroom = google.classroom({ version: 'v1', auth });

  while (true) {
    const choice = Number(await question(`
1. Get Courses
2. Get Assignments
3. Get Assignment Details
4. Join Course
5. Logout
6. Exit
Choose: `));

    switch (choice) {
      case 1:
        await getCourses(classroom);
        break;
      case 2:
        {
          const id = await question('Enter Course ID: ');
          await getAssignments(classroom, id);
        }
        break;
      case 3:
        {
          const cid = await question('Course ID: ');
          const aid = await question('Assignment ID: ');
          await getAssignmentDetails(classroom, cid, aid);
        }
        break;
      case 4:
        {
          const url = await question('Enter Classroom URL: ');
          await joinCourse(classroom, url, null);
        }
        break;
      case 5:
        logout();
        process.exit(0);
      case 6:
        process.exit(0);
      default:
        console.log('❌ Invalid choice.');
    }
  }
})();
