# anonymous votebot

### [add it to your server!](https://discordapp.com/api/oauth2/authorize?client_id=505471909941739546&scope=bot&permissions=2112)

the command prefix is `%`. run commands with
```
%command [--option optionvalue] [--option2 option2value] further arguments
```

## commands

### `help`

prints help

```
%help
```

### `make`

makes a vote.

```
%make [-l|--length] TIME [-v|--voter] @SOMEONE message
```

* `TIME` (only use once) (optional): length of time at which votes will be frozen. use any time parsable by [zeit/ms](https://github.com/zeit/ms), like `1 hour`, `5m`, or `3.45 hrs`. if not provided, vote does not expire
* `@SOMEONE` (multiple allowed) (required): a person who is allowed to vote. the bot sends them a DM
