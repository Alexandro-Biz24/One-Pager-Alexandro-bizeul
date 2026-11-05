export const publicationPages = {
  "beating-the-national-day-ahead-energy-demand-forecast": {
    title: "Beating the national day-ahead energy demand forecast",
    lead: [
      [
        "Development and release of an ",
        { strong: "independent PyTorch implementation of the Multi-Resolution Time Series Transformer (MTST)" },
        ", inspired by the paper presented at ",
        { strong: "AISTATS 2024" },
        ". The model reads a series at several patch lengths at once: short patches follow the peak, long patches follow the week.",
      ],
      [
        "Attention uses ",
        { strong: "relative positional sinusoidal encoding" },
        ": the score depends on the distance between patches, not on an absolute timestamp. The architecture is configurable and reusable. It is distributed on ",
        { strong: "GitHub and PyPI" },
        ", and a pretrained model specialised in the French electricity demand forecast is published on ",
        { strong: "Hugging Face" },
        ".",
      ],
    ],
    huggingface: {
      title: "mtst-rte-day-ahead",
      text: "Pretrained weights for the day-ahead demand forecast.",
      command: "huggingface-cli download Alexandro24B/mtst-rte-day-ahead",
      href: "https://huggingface.co/Alexandro24B/mtst-rte-day-ahead",
    },
    pypi: {
      title: "mtst-forecasting",
      version: "0.3.0",
      text: "Python package to load the model and run a forecast.",
      command: "pip install mtst-forecasting==0.3.0",
      href: "https://pypi.org/project/mtst-forecasting/",
    },
    github: {
      title: "MTST-Forecasting",
      url: "https://github.com/Alexandro-Biz24/MTST-Forecasting",
      href: "https://github.com/Alexandro-Biz24/MTST-Forecasting",
    },
  },
}

const byTitle = Object.fromEntries(
  Object.entries(publicationPages).map(([slug, page]) => [page.title, slug]),
)

export function publicationSlug(title) {
  return byTitle[title] || null
}
