# How Caching Works

Audience: developers who know what a web app and a database are, but not caching.
Length: about a minute and a half.

Every time you open a profile page, the app asks the database for your data. Databases are reliable, but they are slow compared to memory, and a busy site asks the same question thousands of times a minute. All that repeated work makes the page slower and the database tired.

A cache fixes this. It is a small, very fast store that sits between the app and the database and keeps recent answers. When the app needs your profile, it asks the cache first.

If the cache already has it, that is a cache hit. The answer comes straight back, usually in a fraction of a millisecond, and the database never hears about the request.

If the cache does not have it, that is a cache miss. The app goes to the database, gets the answer, and puts a copy in the cache on the way back, so the next person who asks gets a hit.

There is one catch. A cached copy can go stale. If you change your name, the cache may still hold the old one. So every cached item gets an expiry time, called a time to live. When it runs out, the item is dropped and the next request fetches a fresh copy.

The result is a faster site and a calmer database, in exchange for a little bit of staleness that you control.
