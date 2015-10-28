import fs from 'fs';
import crypto from 'crypto';

fs.writeFileSync(process.argv[3], crypto.randomBytes(+process.argv[2]));
