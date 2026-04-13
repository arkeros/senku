# //base/json/pointer

JSON Pointer ([RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901)) resolution for pre-parsed JSON values.

## API

### Types

- `Pointer` — a parsed JSON Pointer, represented as `[]Token`
- `Token` — an encoded path segment; use `String()` to decode

### Construction

```go
// From raw (unescaped) segments — encoding is automatic
ptr := pointer.New("db", "host")           // /db/host
ptr := pointer.New("a/b", "c~d")           // /a~1b/c~0d

// From an RFC 6901 string
ptr, err := pointer.Parse("/db/host")

// Manual token encoding
tok := pointer.Encode("a/b")               // Token("a~1b")
```

### Resolution

```go
pointer.Resolve(parsed any, ptr Pointer) (any, error)
```

Returns the raw Go value (`string`, `float64`, `map[string]any`, `[]any`, etc.).
Callers own the unmarshal and decide how to serialize the result.

### Pointer syntax

| Pointer       | Matches                          |
| ------------- | -------------------------------- |
| `/password`   | Top-level key `password`         |
| `/db/host`    | Nested key `host` inside `db`    |
| `/users/0`    | First element of array `users`   |
| `/a~1b`       | Key `a/b` (`~1` escapes `/`)    |
| `/c~0d`       | Key `c~d` (`~0` escapes `~`)    |
| (empty)       | Whole document                   |

## Example

```go
var parsed any
json.Unmarshal(data, &parsed)

password, _ := pointer.Resolve(parsed, pointer.New("password"))
host, _     := pointer.Resolve(parsed, pointer.New("db", "host"))
```
