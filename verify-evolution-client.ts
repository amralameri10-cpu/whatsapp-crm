import { createServer } from 'node:http';
import { EvolutionClient } from './src/lib/whatsapp/evolution-client';

const received: Array<{ path: string; contentType: string; body: string }> = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const path = req.url || '';
    const contentType = String(req.headers['content-type'] || '');
    received.push({ path, contentType, body });

    res.setHeader('Content-Type', 'application/json');
    if (path.includes('sendWhatsAppAudio')) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: 'endpoint unavailable' } }));
      return;
    }
    if (path.includes('sendText')) {
      const json = JSON.parse(body);
      if (json?.number !== '967700000000' || json?.textMessage?.text !== 'اختبار') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: { message: 'wrong text payload' } }));
        return;
      }
    }
    if (path.includes('sendMedia')) {
      const expectedMedia = body.includes('photo.png') ? 'image' : 'audio';
      const expectedFile = expectedMedia === 'image' ? 'photo.png' : 'voice.ogg';
      const valid = contentType.startsWith('multipart/form-data; boundary=')
        && body.includes('name="number"')
        && body.includes('967700000000')
        && body.includes('name="mediatype"')
        && body.includes(expectedMedia)
        && body.includes(`name="media"; filename="${expectedFile}"`);
      if (!valid) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: { message: 'wrong media payload' } }));
        return;
      }
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ key: { id: `ok-${received.length}` }, status: 'sent' }));
  });
});

server.listen(0, '127.0.0.1', async () => {
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const client = new EvolutionClient(`http://127.0.0.1:${address.port}`, 'test-key');
    await client.sendText('instance', '967700000000', 'اختبار');
    await client.sendMedia(
      'instance',
      '967700000000',
      'image',
      Buffer.from('fake-png').toString('base64'),
      '',
      'photo.png',
      'image/png',
    );
    await client.sendAudio(
      'instance',
      '967700000000',
      Buffer.from('fake-ogg').toString('base64'),
      'audio/ogg',
      'voice.ogg',
    );
    console.log(JSON.stringify({
      passed: true,
      requests: received.map((request) => ({
        path: request.path,
        contentType: request.contentType.split(';')[0],
      })),
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
