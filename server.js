import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
  let room = null;
  let role = null;

  ws.on('message', async (data) => {
    const msg = JSON.parse(data);

    if (msg.type === 'create_room') {
      room = msg.roomCode;
      role = 'teacher';
      rooms.set(room, { teacher: ws, students: [] });
      ws.send(JSON.stringify({ type: 'created', roomCode: room }));
      console.log('Oda oluşturuldu:', room);
    }

    if (msg.type === 'join_room') {
      room = msg.roomCode;
      role = 'student';
      if (rooms.has(room)) {
        rooms.get(room).students.push(ws);
        ws.send(JSON.stringify({ type: 'joined' }));
        rooms.get(room).teacher.send(JSON.stringify({ 
          type: 'student_count', 
          count: rooms.get(room).students.length 
        }));
        console.log('Öğrenci katıldı:', room);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Oda bulunamadı' }));
      }
    }

    if (msg.type === 'transcript' && role === 'teacher') {
      const roomData = rooms.get(room);
      if (roomData) {
        const translated = await translateText(msg.text);
        roomData.students.forEach(s => {
          if (s.readyState === 1) {
            s.send(JSON.stringify({ 
              type: 'translation', 
              original: msg.text, 
              translated 
            }));
          }
        });
      }
    }
  });

  ws.on('close', () => {
    if (room && rooms.has(room)) {
      const roomData = rooms.get(room);
      if (role === 'teacher') {
        roomData.students.forEach(s => s.close());
        rooms.delete(room);
        console.log('Oda kapatıldı:', room);
      } else {
        roomData.students = roomData.students.filter(s => s !== ws);
        if (roomData.teacher.readyState === 1) {
          roomData.teacher.send(JSON.stringify({ 
            type: 'student_count', 
            count: roomData.students.length 
          }));
        }
      }
    }
  });
});

async function translateText(text) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=en&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0][0][0];
  } catch (err) {
    return text;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server çalışıyor: ${PORT}`);
});
