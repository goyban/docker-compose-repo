// Mounted into Mongo's /docker-entrypoint-initdb.d/ and run ONCE, on the very
// first start against an empty data directory. Overleaf needs transactions,
// which Mongo only offers in replica-set mode -- even for a single node.
//
// If you ever wipe ./data/mongo, this runs again. If Mongo has data but no
// replica set, it does NOT run and you must call rs.initiate() by hand.

rs.initiate({ _id: 'overleaf', members: [{ _id: 0, host: 'mongo:27017' }] })
