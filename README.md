# SAP CAP — Associations & Compositions

CDS provides two ways to relate entities: **Association** (a reference between independent records) and **Composition** (a parent-owns-child relationship where children cannot exist without their parent).

---

## Concept Overview

```
Author  ──────────────────►  Book  ◆──────────────────►  Chapter
         Association                   Composition
         (independent)                 (owned, lifecycle-bound)
```

| | Association | Composition |
|---|---|---|
| Child exists independently | ✅ | ❌ |
| Child deleted with parent | ❌ | ✅ |
| `$expand` supported | ✅ | ✅ |
| Deep insert (nested POST) | ❌ | ✅ |
| Typical use case | Book → Author | Book → Chapters, Order → Items |

---

## Project Structure

```
my-bookshop/
├── db/
│   ├── schema.cds
│   └── data/
│       ├── my.bookshop-Authors.csv
│       ├── my.bookshop-Books.csv
│       └── my.bookshop-Chapters.csv
├── srv/
│   ├── cat-service.cds
│   └── cat-service.js
└── package.json
```

---

## Data Model

### `db/schema.cds`

```cds
namespace my.bookshop;

entity Authors {
  key ID      : Integer;
      name    : String(100);
      country : String(50);

      // Backlink: reverse Association (to-many)
      // CAP does NOT generate a foreign key column for this side
      books   : Association to many Books on books.author = $self;
}

entity Books {
  key ID      : Integer;
      title   : String(200);
      price   : Decimal(9, 2);

      // to-one Association: many books → one author
      // CAP auto-generates foreign key column: author_ID
      author  : Association to Authors;

      // Composition: one book owns many chapters
      // Chapters are deleted automatically when the book is deleted
      chapters: Composition of many Chapters on chapters.book = $self;
}

entity Chapters {
  key ID      : Integer;
      title   : String(200);
      content : String(5000);
      seq     : Integer;

      // Back-reference to parent (required for Composition)
      book    : Association to Books;
}
```

**Foreign key generation rule:**

| CDS field | Auto-generated DB column |
|---|---|
| `author : Association to Authors` | `author_ID` |
| `book : Association to Books` | `book_ID` |

CAP follows the pattern `fieldName + _ + targetKeyName`. You never write foreign key columns manually.

---

## Seed Data

### `db/data/my.bookshop-Authors.csv`

```
ID,name,country
1,Robert C. Martin,USA
2,Andrew Hunt,USA
```

### `db/data/my.bookshop-Books.csv`

```
ID,title,price,author_ID
1,Clean Code,38.00,1
2,The Pragmatic Programmer,45.00,2
3,Refactoring,42.00,1
```

> Note: Use `author_ID` in CSV — this is the foreign key column CAP auto-generates.

### `db/data/my.bookshop-Chapters.csv`

```
ID,title,seq,book_ID
1,Clean Code and Why It Matters,1,1
2,Meaningful Names,2,1
3,Functions,3,1
4,A Pragmatic Philosophy,1,2
5,A Pragmatic Approach,2,2
```

---

## Service Definition

### `srv/cat-service.cds`

```cds
using my.bookshop as db from '../db/schema';

service CatalogService {
  entity Books    as projection on db.Books;
  entity Authors  as projection on db.Authors;
  entity Chapters as projection on db.Chapters;
}
```

---

## Service Implementation

### `srv/cat-service.js`

```js
const cds = require('@sap/cds')

module.exports = class CatalogService extends cds.ApplicationService {
  async init() {
    const { Books, Authors, Chapters } = this.entities

    // after READ: enrich book with author fields
    // Only works when client sends $expand=author
    // Use author_ID to manually fetch if $expand is not used
    this.after('READ', Books, async (books, req) => {
      if (!books) return
      const list = Array.isArray(books) ? books : [books]

      for (const book of list) {
        // author_ID is always present (it's the FK column)
        if (book.author_ID) {
          const { Authors } = cds.entities('my.bookshop')
          const author = await SELECT.one.from(Authors).where({ ID: book.author_ID })
          if (author) {
            book.authorName    = author.name
            book.authorCountry = author.country
          }
        }
      }
    })

    // before CREATE: log deep insert payload (book + chapters)
    this.before('CREATE', Books, async req => {
      console.log('Creating book with chapters:', JSON.stringify(req.data, null, 2))
      // req.data.chapters contains the nested chapter array
      // CAP handles the Composition insert automatically
    })

    return super.init()
  }
}
```

---

## Running the Project

```bash
cds watch
```

---

## HTTP Request Examples

### Read all books (flat)
```http
GET /odata/v4/catalog/Books
```

### Expand Association — include author object
```http
GET /odata/v4/catalog/Books?$expand=author
```

Response:
```json
{
  "ID": 1,
  "title": "Clean Code",
  "author": {
    "ID": 1,
    "name": "Robert C. Martin",
    "country": "USA"
  }
}
```

### Expand Composition — include chapters array
```http
GET /odata/v4/catalog/Books?$expand=chapters
```

### Expand everything at once
```http
GET /odata/v4/catalog/Books?$expand=author,chapters
```

### Deep insert — create book with chapters in one request (Composition)
```http
POST /odata/v4/catalog/Books
Content-Type: application/json

{
  "ID": 10,
  "title": "Domain-Driven Design",
  "price": 50.00,
  "author_ID": 2,
  "chapters": [
    { "ID": 100, "title": "Putting the Domain Model to Work", "seq": 1 },
    { "ID": 101, "title": "The Ubiquitous Language", "seq": 2 }
  ]
}
```

CAP automatically inserts both the book and each chapter, setting `book_ID` on each chapter row.

### Delete book — chapters are deleted automatically (Composition)
```http
DELETE /odata/v4/catalog/Books/10
```

After this, chapters with `book_ID = 10` are gone. This is the key difference from Association.

---

## Gotchas

**`book.author` is `undefined` in `after READ` unless `$expand=author` is sent**
```js
// author is only populated when the client requests $expand=author
// Use author_ID (always present) to fetch manually if needed
const author = await SELECT.one.from(Authors).where({ ID: book.author_ID })
```

**CAP triggers `before/after READ` after a POST**

OData requires a `POST` response to include the created record. CAP reads it back from the database after inserting, which triggers your `before('READ')` and `after('READ')` handlers — this is expected behaviour, not a bug.

**`next()` in `on` handlers**
```js
// on replaces the default handler — use next() to keep default DB behaviour
this.on('READ', Books, async (req, next) => {
  const result = await next()  // runs the default DB query
  console.log('result:', result)
  return result
})

// before and after never need next() — they don't replace the default handler
this.before('READ', Books, req => { /* no next() needed */ })
this.after('READ', Books, books => { /* no next() needed */ })
```

**Foreign key column naming**
```
Association field name + _ + target entity key name

author  : Association to Authors  →  author_ID
book    : Association to Books    →  book_ID
```
