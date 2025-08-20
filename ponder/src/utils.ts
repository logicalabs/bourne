
import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect();

export const sqlRead = async (query: string) => {
  try {
    const res = await client.query(query);
    return res.rows;
  } catch (err) {
    console.error('SQL Read Error:', err);
    throw err;
  }
};

export const sqlWrite = async (query: string) => {
  try {
    await client.query(query);
  } catch (err) {
    console.error('SQL Write Error:', err);
    throw err;
  }
};


export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
