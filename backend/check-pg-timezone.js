// backend/test-all-timestamp-methods.js
require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

// ✅ EXACT SAME CONNECTION SETUP AS APP
let connectionString = process.env.DATABASE_URL || '';
if (connectionString.includes('?')) {
  connectionString = `${connectionString}&timezone=UTC`;
} else {
  connectionString = `${connectionString}?timezone=UTC`;
}

console.log('═══════════════════════════════════════════════════════');
console.log('COMPREHENSIVE TIMESTAMP TEST - ALL 20+ METHODS');
console.log('═══════════════════════════════════════════════════════\n');

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function testAllMethods() {
  const client = await pool.connect();
  
  try {
    // Get reference time (EXACT SAME AS chatSharedUtils.ts)
    const jsNow = new Date();
    const jsNowMs = Date.now();
    const utcTimestamp = jsNow.toISOString();
    const utcTimestampNoZ = utcTimestamp.replace('Z', '');
    const utcTimestampWithOffset = utcTimestamp.replace('Z', '+00:00');
    
    // Extract UTC components
    const year = jsNow.getUTCFullYear();
    const month = jsNow.getUTCMonth() + 1;
    const day = jsNow.getUTCDate();
    const hours = jsNow.getUTCHours();
    const minutes = jsNow.getUTCMinutes();
    const seconds = jsNow.getUTCSeconds();
    const milliseconds = jsNow.getUTCMilliseconds();
    const totalSeconds = jsNowMs / 1000;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('REFERENCE TIME (JavaScript):');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Date.now():', jsNowMs, 'ms');
    console.log('toISOString():', utcTimestamp);
    console.log('UTC:', `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`);
    console.log('Expected stored time:', utcTimestamp);
    console.log('');
    
    // Check timezone
    await client.query("SET timezone = 'UTC'");
    const tzResult = await client.query('SHOW timezone');
    console.log('PostgreSQL timezone:', tzResult.rows[0]?.timezone || 'unknown');
    console.log('');
    
    // Create test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS timestamp_comprehensive_test (
        id SERIAL PRIMARY KEY,
        method_name TEXT NOT NULL,
        method_number INT NOT NULL,
        sent_value TEXT,
        sent_type TEXT,
        stored_time TIMESTAMPTZ NOT NULL,
        stored_iso TEXT,
        difference_ms NUMERIC,
        difference_hours NUMERIC,
        status TEXT,
        error_message TEXT
      )
    `);
    
    await client.query('TRUNCATE TABLE timestamp_comprehensive_test');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('TESTING ALL METHODS:');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const methods = [
      // Method 1: ISO string direct cast
      {
        num: 1,
        name: 'ISO string ::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, $5::timestamptz)
                RETURNING stored_time`,
        params: ['Method 1: ISO string ::timestamptz', 1, utcTimestamp, 'ISO string', utcTimestamp]
      },
      
      // Method 2: ISO string without Z
      {
        num: 2,
        name: 'ISO string (no Z) ::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, $5::timestamptz)
                RETURNING stored_time`,
        params: ['Method 2: ISO string (no Z)', 2, utcTimestampNoZ, 'ISO string (no Z)', utcTimestampNoZ]
      },
      
      // Method 3: ISO string with +00:00
      {
        num: 3,
        name: 'ISO string (+00:00) ::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, $5::timestamptz)
                RETURNING stored_time`,
        params: ['Method 3: ISO string (+00:00)', 3, utcTimestampWithOffset, 'ISO string (+00:00)', utcTimestampWithOffset]
      },
      
      // Method 4: to_timestamp(ms/1000)
      {
        num: 4,
        name: 'to_timestamp(ms/1000)',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
                RETURNING stored_time`,
        params: ['Method 4: to_timestamp(ms/1000)', 4, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 5: to_timestamp(ms/1000)::timestamptz
      {
        num: 5,
        name: 'to_timestamp(ms/1000)::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0)::timestamptz)
                RETURNING stored_time`,
        params: ['Method 5: to_timestamp(ms/1000)::timestamptz', 5, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 6: to_timestamp(ms/1000) AT TIME ZONE UTC
      {
        num: 6,
        name: 'to_timestamp(ms/1000) AT TIME ZONE UTC',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0) AT TIME ZONE 'UTC')
                RETURNING stored_time`,
        params: ['Method 6: to_timestamp AT TIME ZONE UTC', 6, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 7: (to_timestamp(ms/1000) AT TIME ZONE UTC)::timestamptz
      {
        num: 7,
        name: '(to_timestamp AT TIME ZONE UTC)::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, (to_timestamp($5 / 1000.0) AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 7: (to_timestamp AT TIME ZONE UTC)::timestamptz', 7, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 8: to_timestamp(seconds)
      {
        num: 8,
        name: 'to_timestamp(seconds)',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5))
                RETURNING stored_time`,
        params: ['Method 8: to_timestamp(seconds)', 8, totalSeconds.toString(), 'seconds', totalSeconds]
      },
      
      // Method 9: to_timestamp(seconds)::timestamptz
      {
        num: 9,
        name: 'to_timestamp(seconds)::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5)::timestamptz)
                RETURNING stored_time`,
        params: ['Method 9: to_timestamp(seconds)::timestamptz', 9, totalSeconds.toString(), 'seconds', totalSeconds]
      },
      
      // Method 10: make_timestamptz
      {
        num: 10,
        name: 'make_timestamptz(UTC components)',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, make_timestamptz($5, $6, $7, $8, $9, $10, 'UTC'))
                RETURNING stored_time`,
        params: ['Method 10: make_timestamptz', 10, `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`, 'UTC components', year, month, day, hours, minutes, seconds + milliseconds / 1000]
      },
      
      // Method 11: timezone('UTC', to_timestamp())
      {
        num: 11,
        name: "timezone('UTC', to_timestamp())",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, timezone('UTC', to_timestamp($5 / 1000.0)))
                RETURNING stored_time`,
        params: ['Method 11: timezone(UTC, to_timestamp)', 11, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 12: timezone('UTC', to_timestamp())::timestamptz
      {
        num: 12,
        name: "timezone('UTC', to_timestamp())::timestamptz",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, timezone('UTC', to_timestamp($5 / 1000.0))::timestamptz)
                RETURNING stored_time`,
        params: ['Method 12: timezone(UTC, to_timestamp)::timestamptz', 12, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 13: SET timezone then ISO string (handled separately in loop)
      {
        num: 13,
        name: 'SET LOCAL timezone UTC then ISO string',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, $5::timestamptz)
                RETURNING stored_time`,
        params: ['Method 13: SET LOCAL timezone then ISO', 13, utcTimestamp, 'ISO string', utcTimestamp]
      },
      
      // Method 14: PostgreSQL NOW()
      {
        num: 14,
        name: 'NOW()',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, NOW())
                RETURNING stored_time`,
        params: ['Method 14: NOW()', 14, 'NOW()', 'PostgreSQL function']
      },
      
      // Method 15: NOW() AT TIME ZONE UTC
      {
        num: 15,
        name: 'NOW() AT TIME ZONE UTC',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, NOW() AT TIME ZONE 'UTC')
                RETURNING stored_time`,
        params: ['Method 15: NOW() AT TIME ZONE UTC', 15, 'NOW() AT TIME ZONE UTC', 'PostgreSQL function']
      },
      
      // Method 16: (NOW() AT TIME ZONE UTC)::timestamptz
      {
        num: 16,
        name: '(NOW() AT TIME ZONE UTC)::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 16: (NOW() AT TIME ZONE UTC)::timestamptz', 16, 'NOW() AT TIME ZONE UTC', 'PostgreSQL function']
      },
      
      // Method 17: to_timestamp with format
      {
        num: 17,
        name: "to_timestamp(ISO, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 17: to_timestamp with format', 17, utcTimestamp, 'ISO string', utcTimestamp]
      },
      
      // Method 18: to_timestamp with format (no Z)
      {
        num: 18,
        name: "to_timestamp(ISO, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') AT TIME ZONE UTC",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, (to_timestamp($5, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 18: to_timestamp format AT TIME ZONE', 18, utcTimestampNoZ, 'ISO string (no Z)', utcTimestampNoZ]
      },
      
      // Method 19: CAST with explicit UTC
      {
        num: 19,
        name: "CAST(ISO AS timestamp) AT TIME ZONE UTC",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, (CAST($5 AS timestamp) AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 19: CAST AS timestamp AT TIME ZONE', 19, utcTimestampNoZ, 'ISO string (no Z)', utcTimestampNoZ]
      },
      
      // Method 20: JavaScript Date object directly
      {
        num: 20,
        name: 'JavaScript Date object ::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, $5::timestamptz)
                RETURNING stored_time`,
        params: ['Method 20: JavaScript Date object', 20, jsNow.toString(), 'Date object', jsNow]
      },
      
      // Method 21: Transaction with SET timezone (handled separately in loop)
      {
        num: 21,
        name: 'Transaction: SET LOCAL timezone then ISO',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, $5::timestamptz)
                RETURNING stored_time`,
        params: ['Method 21: Transaction SET LOCAL timezone', 21, utcTimestamp, 'ISO string', utcTimestamp]
      },
      
      // Method 22: to_timestamp with explicit UTC in format
      {
        num: 22,
        name: "timezone('UTC', to_timestamp(ISO, format))",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, timezone('UTC', to_timestamp($5, 'YYYY-MM-DD"T"HH24:MI:SS.MS'))::timestamptz)
                RETURNING stored_time`,
        params: ['Method 22: timezone(UTC, to_timestamp format)', 22, utcTimestampNoZ, 'ISO string (no Z)', utcTimestampNoZ]
      },
      
      // Method 23: to_timestamp(seconds) AT TIME ZONE UTC
      {
        num: 23,
        name: 'to_timestamp(seconds) AT TIME ZONE UTC',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, to_timestamp($5) AT TIME ZONE 'UTC')
                RETURNING stored_time`,
        params: ['Method 23: to_timestamp(seconds) AT TIME ZONE UTC', 23, totalSeconds.toString(), 'seconds', totalSeconds]
      },
      
      // Method 24: (to_timestamp(seconds) AT TIME ZONE UTC)::timestamptz
      {
        num: 24,
        name: '(to_timestamp(seconds) AT TIME ZONE UTC)::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, (to_timestamp($5) AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 24: (to_timestamp(seconds) AT TIME ZONE UTC)::timestamptz', 24, totalSeconds.toString(), 'seconds', totalSeconds]
      },
      
      // Method 25: make_timestamptz with explicit UTC (with milliseconds)
      {
        num: 25,
        name: 'make_timestamptz(UTC components with ms)',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, make_timestamptz($5, $6, $7, $8, $9, $10, 'UTC'))
                RETURNING stored_time`,
        params: ['Method 25: make_timestamptz with ms', 25, `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`, 'UTC components', year, month, day, hours, minutes, seconds + milliseconds / 1000.0]
      },
      
      // Method 26: ISO string with explicit UTC cast
      {
        num: 26,
        name: "(ISO string AT TIME ZONE 'UTC')::timestamptz",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, ($5::timestamp AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 26: ISO AT TIME ZONE UTC', 26, utcTimestampNoZ, 'ISO string (no Z)', utcTimestampNoZ]
      },
      
      // Method 27: ISO string with Z, explicit UTC
      {
        num: 27,
        name: "(ISO string with Z AT TIME ZONE 'UTC')::timestamptz",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, (REPLACE($5, 'Z', '')::timestamp AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 27: ISO with Z AT TIME ZONE UTC', 27, utcTimestamp, 'ISO string', utcTimestamp]
      },
      
      // Method 28: to_timestamp with explicit UTC timezone function
      {
        num: 28,
        name: "timezone('UTC', to_timestamp(ms/1000))",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, timezone('UTC', to_timestamp($5 / 1000.0)))
                RETURNING stored_time`,
        params: ['Method 28: timezone(UTC, to_timestamp)', 28, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 29: timezone('UTC', to_timestamp())::timestamptz
      {
        num: 29,
        name: "timezone('UTC', to_timestamp(ms/1000))::timestamptz",
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, timezone('UTC', to_timestamp($5 / 1000.0))::timestamptz)
                RETURNING stored_time`,
        params: ['Method 29: timezone(UTC, to_timestamp)::timestamptz', 29, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 30: Direct epoch cast (if supported)
      {
        num: 30,
        name: 'Epoch milliseconds direct cast',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, $4, ($5::bigint / 1000)::timestamp::timestamptz)
                RETURNING stored_time`,
        params: ['Method 30: Epoch direct cast', 30, jsNowMs.toString(), 'milliseconds', jsNowMs]
      },
      
      // Method 31: Using CURRENT_TIMESTAMP AT TIME ZONE UTC (for comparison)
      {
        num: 31,
        name: 'CURRENT_TIMESTAMP AT TIME ZONE UTC',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
                RETURNING stored_time`,
        params: ['Method 31: CURRENT_TIMESTAMP AT TIME ZONE UTC', 31, 'CURRENT_TIMESTAMP', 'PostgreSQL function']
      },
      
      // Method 32: (CURRENT_TIMESTAMP AT TIME ZONE UTC)::timestamptz
      {
        num: 32,
        name: '(CURRENT_TIMESTAMP AT TIME ZONE UTC)::timestamptz',
        query: `INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
                VALUES ($1, $2, $3, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamptz)
                RETURNING stored_time`,
        params: ['Method 32: (CURRENT_TIMESTAMP AT TIME ZONE UTC)::timestamptz', 32, 'CURRENT_TIMESTAMP', 'PostgreSQL function']
      }
    ];
    
    // Test each method
    for (const method of methods) {
      try {
        console.log(`\n[TEST ${method.num}] ${method.name}`);
        console.log('─'.repeat(60));
        console.log('Sent value:', method.params[2]);
        console.log('Sent type:', method.params[3]);
        
        let result;
        
        // Handle methods with multiple queries (13, 21) - execute separately
        if (method.num === 13 || method.num === 21) {
          // Method 13: SET LOCAL timezone then INSERT
          if (method.num === 13) {
            await client.query("SET LOCAL timezone = 'UTC'");
            result = await client.query(`
              INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
              VALUES ($1, $2, $3, $4, $5::timestamptz)
              RETURNING stored_time
            `, method.params);
          }
          // Method 21: Transaction with SET timezone
          else if (method.num === 21) {
            await client.query('BEGIN');
            await client.query("SET LOCAL timezone = 'UTC'");
            result = await client.query(`
              INSERT INTO timestamp_comprehensive_test (method_name, method_number, sent_value, sent_type, stored_time)
              VALUES ($1, $2, $3, $4, $5::timestamptz)
              RETURNING stored_time
            `, method.params);
            await client.query('COMMIT');
          }
        } else {
          // Normal single query
          result = await client.query(method.query, method.params);
        }
        
        if (result.rows && result.rows.length > 0) {
          const storedTime = result.rows[0].stored_time;
          const storedDate = storedTime instanceof Date ? storedTime : new Date(storedTime);
          const storedISO = storedDate.toISOString();
          const storedMs = storedDate.getTime();
          const diffMs = storedMs - jsNowMs;
          const diffHours = diffMs / (1000 * 60 * 60);
          
          console.log('✅ INSERTED');
          console.log('   Stored (raw):', storedTime);
          console.log('   Stored (ISO):', storedISO);
          console.log('   Expected (ISO):', utcTimestamp);
          console.log('   Difference (ms):', diffMs);
          console.log('   Difference (hours):', diffHours.toFixed(2));
          
          // Update record with results - Fix: Explicitly cast parameters
          await client.query(`
            UPDATE timestamp_comprehensive_test 
            SET stored_iso = $1::text,
                difference_ms = $2::numeric,
                difference_hours = $3::numeric,
                status = CASE 
                  WHEN ABS($2::numeric) < 1000 THEN '✅ PERFECT (< 1s)'
                  WHEN ABS($2::numeric) < 60000 THEN '⚠️ CLOSE (< 1m)'
                  WHEN ABS($2::numeric) < 3600000 THEN '❌ WRONG (< 1h)'
                  ELSE '❌ VERY WRONG (> 1h)'
                END
            WHERE method_number = $4::integer
          `, [storedISO, String(diffMs), String(diffHours), String(method.num)]);
        } else {
          console.log('⚠️ INSERTED BUT NO RETURNED ROW');
          await client.query(`
            UPDATE timestamp_comprehensive_test 
            SET status = '⚠️ NO RETURN'
            WHERE method_number = $1
          `, [method.num]);
        }
      } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        await client.query(`
          UPDATE timestamp_comprehensive_test 
          SET error_message = $1,
              status = '❌ ERROR'
          WHERE method_number = $2
        `, [error.message.substring(0, 200), method.num]);
      }
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Display final results
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('FINAL RESULTS - ALL METHODS:');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const results = await client.query(`
      SELECT 
        method_number,
        method_name,
        sent_value,
        stored_iso,
        difference_ms,
        difference_hours,
        status,
        error_message
      FROM timestamp_comprehensive_test
      ORDER BY ABS(COALESCE(difference_ms, 999999999)) ASC
    `);
    
    console.log('Method'.padEnd(50), '|', 'Status'.padEnd(20), '|', 'Diff (ms)'.padEnd(12), '|', 'Diff (hours)');
    console.log('-'.repeat(120));
    
    results.rows.forEach(row => {
      const diffMs = row.difference_ms ? Math.round(row.difference_ms) : 'N/A';
      const diffHours = (row.difference_hours && typeof row.difference_hours === 'number') ? row.difference_hours.toFixed(2) : 'N/A';
      
      console.log(
        `${row.method_number}. ${row.method_name}`.padEnd(50),
        '|',
        (row.status || 'N/A').padEnd(20),
        '|',
        diffMs.toString().padEnd(12),
        '|',
        diffHours
      );
      
      if (row.error_message) {
        console.log(`   Error: ${row.error_message}`);
      }
    });
    
    // Find best method
    const bestMethod = results.rows.find(r => r.difference_ms && Math.abs(r.difference_ms) < 1000);
    
    console.log('\n═══════════════════════════════════════════════════════');
    if (bestMethod) {
      console.log('✅ BEST METHOD:', bestMethod.method_name);
      console.log('   Difference:', bestMethod.difference_ms, 'ms');
      console.log('   Use this in your code!');
    } else {
      console.log('⚠️ NO PERFECT METHOD FOUND');
      const closest = results.rows[0];
      console.log('   Closest:', closest.method_name);
      console.log('   Difference:', closest.difference_ms, 'ms');
    }
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('FATAL ERROR:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testAllMethods().catch(console.error);