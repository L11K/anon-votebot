const Discord = require('discord.js')
const stringArgv = require('string-argv')
const arg = require('arg')
const ms = require('ms')
const emojiRegex = require('emoji-regex/text')()

const client = new Discord.Client()

const prefix = '%'
const richColor = 0x33ff33

client.on('ready', () => {
  console.log('ready!')
  client.user.setActivity(`${prefix}help`, {
    type: 'WATCHING',
  })
})

const makeOptHelp = `
* \`TIME\` (only use once) (optional): length of time at which votes will be frozen. use any time like \`1 hour\`, \`5m\`, or \`3.45 hrs\`. if not provided, vote does not expire
* \`EMOJI\` (multiple allowed) (optional): option for which people can vote for. defaults to :red_circle: and :large_blue_circle:
* \`@SOMEONE\` (multiple allowed) (required): a person who is allowed to vote. the bot sends them a DM
`

const commands = new Map([
  ['help', ['sends help info', '', async (msg) => {
    const commandHelp = [...commands.entries()].map((command) => ({
      name: `command: \`${prefix}${command[0]} ${command[1][1]}\``,
      value: command[1][0],
      inline: false,
    }))
    await msg.channel.send(new Discord.RichEmbed({
      color: richColor,
      description: 'anonymously vote with anon votebot!',
      fields: [{
        name: 'calling commands',
        value: `commands can be called by mentioning <@${client.user.id}>, or by prefixing commands with \`${prefix}\``,
        inline: false,
      }, ...commandHelp, {
        name: `help for \`${prefix}make\``,
        value: makeOptHelp,
        inline: false,
      }],
    }))
  }]],
  ['make', [
    'make a new vote',
    '[-l|--length] TIME [-o|--option] EMOJI [-v|--voter] @SOMEONE message',
    async (createMsg, content) => {
      const argVoters = new Set()
      const argOptions = new Map()
      let argOptionReactions
      let argLength
      let argContent
      try {
        const args = arg({
          '--length': String,
          '-l': '--length',
          '--option': [String],
          '-o': '--option',
          '--voter': [String],
          '-v': '--voter',
        }, {
          argv: stringArgv(content),
        })
        await Promise.all(args['--voter'].map(async (voterValue) => {
          if (voterValue.includes('@everyone')) {
            for (argVoter of createMsg.channel.members.keys()) {
              argVoters.add(argVoter)
            }
          } else if (voterValue.includes('@here')) {
            for (argVoter of [...createMsg.channel.members.values()].filter(member => member.presence.status !== 'offline')) {
              argVoters.add(argVoter.id)
            }
          } else {
            const userMatch = voterValue.match(/<@!?[0-9]+>/)
            if (userMatch === null) {
              const roleMatch = voterValue.match(/<@&[0-9]+>/)
              if (roleMatch === null) {
                throw new Error()
              }
              for (argVoter of createMsg.guild.roles.get(roleMatch[0].replace(/[<>@&!]/g, '')).members.keys()) {
                argVoters.add(argVoter)
              }
            } else {
              argVoters.add(userMatch[0].replace(/[<>@!]/g, ''))
            }
          }
        }))
        if (args['--length'] !== undefined) {
          argLength = ms(args['--length'])
        }
        if (args['--option'] !== undefined) {
          args['--option'].forEach((opt) => {
            const optMatch = opt.match(/<:.*:[0-9]+>/)
            if (optMatch === null) {
              const emojiMatch = opt.match(emojiRegex)
              if (emojiMatch === null) {
                throw Error()
              }
              argOptions.set(emojiMatch[0], emojiMatch[0])
            } else {
              const optSf = optMatch[0].replace(/(<:.*:)?>?/g, '')
              argOptions.set(optSf, createMsg.guild.emojis.get(optSf))
            }
          })
        }
        if (argOptions.size === 0) {
          argOptions.set('\ud83d\udd34', '\ud83d\udd34')
        }
        if (argOptions.size === 1) {
          argOptions.set('\ud83d\udd35', '\ud83d\udd35')
        }
        argOptionReactions = [...argOptions.keys()]
        argContent = args._.join(' ')
        if (argContent === '') {
          throw new Error()
        }
      } catch (e) {
        createMsg.channel.send(`<@${createMsg.author.id}> parsing your command failed`)
        return
      }
      let votes = Array(argOptions.size).fill(0)
      let votesClosed = false
      let voteMsgs = []
      const makeReport = () => new Discord.RichEmbed({
        color: richColor,
        author: {
          icon_url: createMsg.author.avatarURL,
          name: `${createMsg.author.username}#${createMsg.author.discriminator}`,
        },
        fields: [{
          name: 'vote content',
          value: argContent,
          inline: false,
        }, {
          name: 'results',
          value: [...argOptions.values()].map((argOption, i) => `${argOption}: ${votes[i]}`).join(' '),
          inline: false,
        }, {
          name: votesClosed ? 'closed' : 'close',
          value: votesClosed ? 'voting is now closed' : `${argLength === undefined ? '' : `voting will be closed ${ms(argLength, {
            long: true,
          })} from when the vote was made\n`}<@${createMsg.author.id}> can manually close the vote by reacting with \ud83d\uded1`,
          inline: false,
        }],
      })
      const reportMsg = await createMsg.channel.send(makeReport())
      const closeVote = () => {
        if (votesClosed) {
          return
        }
        votesClosed = true
        closedCollector.stop()
        reportMsg.edit(makeReport())
        voteMsgs.forEach((sentMsg) => {
          if (sentMsg[1] === null) {
            sentMsg[2].stop()
          }
          sentMsg[0].edit(new Discord.RichEmbed({
            color: richColor,
            author: {
              icon_url: createMsg.author.avatarURL,
              name: `${createMsg.author.username}#${createMsg.author.discriminator}`,
            },
            description: 'voting is now closed',
            fields: [{
              name: 'vote content',
              value: argContent,
              inline: false,
            }, {
              name: 'your vote',
              value: sentMsg[1] === null ? 'none' : sentMsg[1],
              inline: false,
            }],
          }))
        })
      }
      const closedCollector = new Discord.ReactionCollector(reportMsg, (reaction) => {
        const reactionEmoji = reaction.emoji.toString()
        if (reactionEmoji !== '\ud83d\uded1') {
          return false
        }
        if (reaction.users.some(reactionUser => reactionUser.id === createMsg.author.id)) {
          return true
        }
        return false
      })
      closedCollector.on('collect', () => {
        closeVote()
      })
      if (argLength !== undefined) {
        setTimeout(() => {
          closeVote()
        }, argLength)
      }
      await reportMsg.react('\ud83d\uded1')
      await Promise.all([...argVoters.values()].map(async (userSf) => {
        const user = await client.fetchUser(userSf)
        if (user.bot) {
          return
        }
        const voteMsg = await (await user.createDM()).send(new Discord.RichEmbed({
          color: richColor,
          author: {
            icon_url: createMsg.author.avatarURL,
            name: `${createMsg.author.username}#${createMsg.author.discriminator}`,
          },
          description: `you have a new vote!`,
          fields: [{
            name: 'vote content',
            value: argContent,
            inline: false,
          }, {
            name: 'instructions',
            value: `react with ${[...argOptions.values()].map(argOption => argOption).join(' or ')} to vote`,
            inline: false,
          }],
        }))
        let voted = false
        const sentCollector = new Discord.ReactionCollector(voteMsg, (reaction) => {
          const reactionEmoji = reaction.emoji.toString()
          if (!reaction.users.some(reactionUser => reactionUser.id !== client.user.id)) {
            return false
          }
          if (!argOptionReactions.includes(reactionEmoji.replace(/(<:.*:)?>?/g, ''))) {
            return false
          }
          return true
        })
        voteMsgs.push([voteMsg, null, sentCollector])
        sentCollector.on('collect', (reaction) => {
          if (voted || votesClosed) {
            return
          }
          voted = true
          sentCollector.stop()
          const reactionEmoji = reaction.emoji.toString()
          voteMsg.edit(new Discord.RichEmbed({
            color: richColor,
            author: {
              icon_url: createMsg.author.avatarURL,
              name: `${createMsg.author.username}#${createMsg.author.discriminator}`,
            },
            description: 'you have voted',
            fields: [{
              name: 'vote content',
              value: argContent,
              inline: false,
            }, {
              name: 'your vote',
              value: reactionEmoji,
              inline: false,
            }],
          }))
          const sentMsgElement = voteMsgs.find(sentMsgElement => sentMsgElement[0] === voteMsg)
          sentMsgElement[1] = reactionEmoji
          const reactionIndex = argOptionReactions.indexOf(reactionEmoji.replace(/(<:.*:)?>?/g, ''))
          votes[reactionIndex] += 1
          reportMsg.edit(makeReport())
        })
        for (argOption of argOptions) {
          await voteMsg.react(argOption[1])
        }
      }))
  }]],
])

client.on('message', (msg) => {
  if (msg.author.bot) {
    return
  }
  let content = msg.content.trim()
  const mentionsBot = content.startsWith(`<@${client.user.id}>`)
  const prefixesBot = content.startsWith(prefix) 
  if (!prefixesBot && !mentionsBot) {
    return
  }
  content = content.substr(mentionsBot ? (client.user.id.length + 3) : prefix.length)
  const commandName = content.trim().split(' ', 1)[0].toLowerCase()
  const command = commands.get(commandName)
  if (command === undefined) {
    commands.get('help')[2](msg)
    return
  }
  content = content.substr(commandName.length + 1)
  command[2](msg, content)
})

client.login(process.env.APP_TOKEN)
