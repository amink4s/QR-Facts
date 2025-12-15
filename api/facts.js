import { Pool } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const { rows } = await pool.query(`
        SELECT * FROM spotlights 
        WHERE auction_date = CURRENT_DATE
    `);

    res.status(200).json(rows);
}