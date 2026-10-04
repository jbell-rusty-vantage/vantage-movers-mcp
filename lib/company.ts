/**
 * Instructions the general MCP endpoint hands to every agent that connects: who the business is
 * and which tools own which job.
 */
export const VANTAGE_COMPANY_NAME = "Vantage Movers LLC";
export const VANTAGE_SERVER_INSTRUCTIONS = `These tools serve ${VANTAGE_COMPANY_NAME} (Vantage or Vantage Movers), a licensed moving broker headquartered in Boynton Beach, Florida. Its sales reps talk with the customer, take the household inventory, price the move and book it with a carrier that performs the move. A carrier, another mover or a competitor named in a record is not Vantage. Form Leads and Call Leads are written only through the lead tools, so duplicate detection, Sheet Sync and CRM posting stay on the Vantage API; the Mongo tools are read-only. To answer a question about a customer or a phone number, start with find_contact_number, find_lead_candidates or get_lead_history before any Mongo query.`;
