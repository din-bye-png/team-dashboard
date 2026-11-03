const expiredMessage='Ссылка недействительна или уже использована. Попросите администратора отправить новую ссылку и откройте последнее письмо.';

// Consume the fragment before any network request; never persist email-link tokens.
export function consumeAuthLink(location,history) {
  const url=new URL(location.href),params=new URLSearchParams(url.hash.slice(1));
  const keys=['access_token','refresh_token','token_type','expires_in','expires_at','type','error','error_code','error_description','sb'];
  const present=keys.some(key=>params.has(key));
  if(!present)return null;
  const link={type:params.get('type'),access_token:params.get('access_token'),refresh_token:params.get('refresh_token')};
  const invalid=params.has('error')||params.has('error_code')||!link.access_token||!link.refresh_token
    ||!['invite','recovery','signup','magiclink','email_change'].includes(link.type);
  for(const key of keys)params.delete(key);
  url.hash=params.toString();
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  return invalid?{error:expiredMessage}:link;
}

export {expiredMessage};
