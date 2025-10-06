import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Fix any double-encoded JSON in layout_config column
  // This migration fixes data that was stored as JSON.stringify(JSON.stringify(object))
  // instead of just the object
  
  console.log('Fixing double-encoded layout_config data...');
  
  // Get all user_widget_layouts records
  const layouts = await knex('user_widget_layouts').select('id', 'layout_config');
  
  for (const layout of layouts) {
    try {
      let layoutConfig = layout.layout_config;
      
      // Check if it's a string (double-encoded)
      if (typeof layoutConfig === 'string') {
        // Try to parse it once
        const parsed = JSON.parse(layoutConfig);
        
        // If the parsed result is still a string, it was double-encoded
        if (typeof parsed === 'string') {
          const doubleParsed = JSON.parse(parsed);
          console.log(`Fixing double-encoded layout_config for record ${layout.id}`);
          
          // Update with the properly parsed object
          await knex('user_widget_layouts')
            .where('id', layout.id)
            .update({ layout_config: doubleParsed });
        }
      }
    } catch (error) {
      console.warn(`Failed to fix layout_config for record ${layout.id}:`, error);
      // Set a default layout config for corrupted data
      await knex('user_widget_layouts')
        .where('id', layout.id)
        .update({ 
          layout_config: { 
            position: { x: 0, y: 0, w: 3, h: 2 }, 
            size: 'medium' 
          } 
        });
    }
  }
  
  console.log('Finished fixing double-encoded layout_config data');
}

export async function down(_knex: Knex): Promise<void> {
  // This migration is not easily reversible as we don't know which records were double-encoded
  // and which were already correct
  console.log('Migration 004_fix_double_encoded_layout_config cannot be reversed');
}

