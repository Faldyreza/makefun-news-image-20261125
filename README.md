[![news-image-20261125](https://make.fun/badge/news-image-20261125.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![rank](https://make.fun/badge/news-image-20261125/Faldyreza/makefun-news-image-20261125/rank.svg)](https://make.fun/bounty/news-image-20261125/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)
[![reward](https://make.fun/badge/news-image-20261125/Faldyreza/makefun-news-image-20261125/reward.svg)](https://make.fun/bounty/news-image-20261125?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261125)

# THE WORLD — Wednesday, 25 November 2026

One image that sums up the world's news of Wednesday 25 November 2026, built
for the [make.fun news-image-20261125 bounty](https://make.fun/bounty/news-image-20261125).

## The day in one image

- **Lead — Cartagena, Colombia:** security forces stormed an Exito supermarket
  at dawn and freed every hostage — about 30 people seized after a failed
  armoured-truck robbery. One gunman was killed, four were detained.
- **Space — China / Pakistan:** Shenzhou-24 carried Muhammad Zeeshan Ali, the
  first Pakistani astronaut and the first foreign visitor to China's Tiangong
  station, into orbit and docked 3.5 hours after launch.
- **Bangladesh:** the wage board raised garment workers' minimum pay 36% to
  17,000 taka a month after weeks of protests.
- **Indonesia:** nine dead and 17 still trapped after floodwater filled an
  unauthorised gold mine shaft at Pongkor, Bogor.
- **In brief:** coalition strikes on Hodeidah, the Solomon Islands–Australia
  security treaty, Nvidia's slide, the Chen Jining probe, the Mississippi
  Cessna crash, and the Huawei verdict.

Sources: AP, Reuters, Nature, SpacePolicyOnline, TBS News, The Register.

## How it is made

`main.ts` (Node 22, standard library only, no network at run time) draws the
whole front page procedurally — a small software rasteriser, a 5x7 bitmap font
written for this entry, and its own PNG encoder — and writes
`/output/entry.png` (1024x1024) plus `/output/dossier.json`. Two runs produce
byte-identical output.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Licence

MIT — see [LICENSE](LICENSE).
