import fs from 'fs/promises';
import { DataShape } from './types';
import path from 'path';

const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'data.json');

const defaultData: DataShape = {
  users: [],
  bookings: [],
  payments: [],
};

export async function readData() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(raw) as DataShape;
  } catch (err) {
    // if file doesn't exist, init it
    await writeData(defaultData);
    return defaultData;
  }
}

export async function writeData(data: DataShape) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function resetData() {
  await writeData(defaultData);
}
