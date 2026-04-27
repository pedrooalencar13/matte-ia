const axios = require('axios');

async function personalizeEmail(template, contato) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return template.corpo;

  const prompt = `Você é Pedro Aranha, estrategista de tráfego pago.
Personalize levemente este email para o contato abaixo.
Mantenha o tom direto. Não altere o CTA final.
Se o nome estiver disponível, insira uma saudação personalizada no início.
Mantenha 95% do texto original.
NUNCA use as palavras "lead" ou "leads" — use sempre "cliente" ou "clientes".

CONTATO:
Nome: ${contato.nome || 'não informado'}
Área: ${contato.medium || contato.tags || 'advocacia'}
Cidade: ${contato.cidade || 'não informada'}

EMAIL ORIGINAL:
${template.corpo}

Retorne APENAS o email personalizado, sem comentários adicionais.`;

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 20000
      }
    );
    return res.data.content?.[0]?.text || template.corpo;
  } catch(e) {
    console.error('[PERSONALIZER] Erro:', e.message);
    return template.corpo;
  }
}

module.exports = { personalizeEmail };
