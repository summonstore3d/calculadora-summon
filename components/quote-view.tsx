import { money } from "@/lib/summon";
import type { Quote } from "@/lib/quote";

const br = (day: string) => day.split("-").reverse().join("/");

/** Orçamento como o cliente vê: usado na página pública e na pré-visualização dentro do sistema. */
export function QuoteView({ quote }: { quote: Quote }) {
  return (
    <article className="quote-sheet">
      <header className="quote-head">
        <div>
          <h1>{quote.businessName}</h1>
          {quote.businessContact && <p>{quote.businessContact}</p>}
        </div>
        <dl>
          <div>
            <dt>Orçamento</dt>
            <dd>{quote.number}</dd>
          </div>
          <div>
            <dt>Emitido em</dt>
            <dd>{br(quote.issuedAt)}</dd>
          </div>
          <div>
            <dt>Válido até</dt>
            <dd>{br(quote.validUntil)}</dd>
          </div>
        </dl>
      </header>
      <p className="quote-customer">
        Para <b>{quote.customerName}</b>
      </p>
      <table className="quote-items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qtd.</th>
            <th>Unitário</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, index) => (
            <tr key={index}>
              <td>
                {item.name}
                {item.discount > 0 && <small>Desconto de {money(item.discount)}</small>}
              </td>
              <td>{item.quantity}</td>
              <td>{money(item.unitPrice)}</td>
              <td>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="quote-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{money(quote.subtotal)}</dd>
        </div>
        {quote.discount > 0 && (
          <div>
            <dt>Desconto</dt>
            <dd>− {money(quote.discount)}</dd>
          </div>
        )}
        {quote.shipping > 0 && (
          <div>
            <dt>Frete</dt>
            <dd>{money(quote.shipping)}</dd>
          </div>
        )}
        <div className="quote-total">
          <dt>Total</dt>
          <dd>{money(quote.total)}</dd>
        </div>
      </dl>
      <ul className="quote-terms">
        <li>
          Prazo de produção:{" "}
          {quote.leadDays ? `${quote.leadDays} dia${quote.leadDays === 1 ? "" : "s"} úteis após a aprovação` : "a combinar"}
        </li>
        {quote.paymentMethod && <li>Pagamento: {quote.paymentMethod}</li>}
      </ul>
      {quote.notes && <p className="quote-notes">{quote.notes}</p>}
    </article>
  );
}
