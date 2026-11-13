// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_next_leper_queen.sql';
import m0001 from './0001_lying_amphibian.sql';
import m0002 from './0002_wonderful_beyonder.sql';
import m0003 from './0003_acknowledged_discrepancy_amount.sql';
import m0004 from './0004_debt_payments.sql';
import m0005 from './0005_saved_people.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  