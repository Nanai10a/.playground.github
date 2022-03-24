# Example Action

## Inputs

### `token`

use `${{ secrets.GITHUB_TOKEN }}`

### `event`

use `${{ toJSON(github.event) }}`

## Outputs

none

## Usage

```yaml
uses: repo/example@v0.0.0
```
