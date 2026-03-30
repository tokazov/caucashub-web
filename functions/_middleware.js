export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  if (url.pathname === "/" || url.pathname === "") {
    const text = await response.text();
    const inject = '<script>window.openPlansModal=function(e){if(e)e.stopPropagation();if(typeof closeModal==="function")closeModal("authOverlay");setTimeout(function(){var p=document.getElementById("paywallOverlay");if(p)p.classList.add("on");},150);};</script>';
    const fixed = text.replace("</body>", inject + "\n</body>");
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(fixed, { status: response.status, headers });
  }
  return response;
}