# Google Search Console finalisation

## Property
Use a Domain property for `ijlanga.co.za` when possible. Google says a Domain property covers the domain's protocols and subdomains; Domain properties use DNS verification.

## DNS TXT verification
In Google Search Console:

1. Add the `ijlanga.co.za` Domain property.
2. Choose DNS verification.
3. Copy the exact TXT record Google provides, beginning with `google-site-verification=`.
4. Add that TXT record at the domain's DNS provider.
5. Wait for DNS propagation if necessary and click Verify in Search Console.
6. Keep the TXT record in DNS after verification so ownership remains verified.

Do not replace the verification value with a guessed value and do not commit the verification token to the repository.

## Sitemap
The website now publishes:

`https://www.ijlanga.co.za/sitemap.xml`

It is also declared in `robots.txt`. After the property is verified, submit the sitemap in the Search Console Sitemaps report and inspect the homepage with URL Inspection.

## Post-release checks
- Inspect `https://www.ijlanga.co.za/`.
- Confirm Google sees the declared canonical as `https://www.ijlanga.co.za/`.
- Confirm indexing is allowed for the homepage.
- Confirm structured data is detected.
- Submit the sitemap and monitor its status.
- Request indexing for the homepage after the release if appropriate.
